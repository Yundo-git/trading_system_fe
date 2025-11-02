import { useEffect, useState, useCallback, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import useBotStatus from '../hooks/useBotStatus';

const WebSocketState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

const WebSocketConnection = ({ onMessage }) => {
  const [messages, setMessages] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const lastPongRef = useRef(Date.now());

  const { botStatus, checkStatus } = useBotStatus(30000);

  const sendHeartbeat = useCallback(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocketState.OPEN) {
      try {
        const pingMsg = JSON.stringify({ 
          type: 'ping', 
          timestamp: Date.now() 
        });
        console.log('Sending ping:', pingMsg);
        socket.send(pingMsg);
      } catch (error) {
        console.error('Error sending heartbeat:', error);
      }
    }
  }, []);

  const checkConnection = useCallback(() => {
    const now = Date.now();
    const timeSinceLastPong = now - lastPongRef.current;
    
    if (timeSinceLastPong > 30000) {
      console.warn('No PONG received in 30 seconds. Reconnecting...');
      if (socketRef.current) {
        const PONG_TIMEOUT_CODE = 4000;
        socketRef.current.close(PONG_TIMEOUT_CODE, 'Pong timeout'); 
      }
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    if (socketRef.current && 
        (socketRef.current.readyState === WebSocketState.OPEN || 
         socketRef.current.readyState === WebSocketState.CONNECTING)) {
      socketRef.current.close(4000, 'New connection attempt'); 
    }

    // Construct WebSocket URL with proper protocol handling
    const getWebSocketUrl = () => {
      if (process.env.REACT_APP_BACKEND_URL) {
        const url = new URL(process.env.REACT_APP_BACKEND_URL);
        const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${url.host}/ws/logs`;
      }
      return 'ws://localhost:8000/ws/logs';
    };
    
    const wsUrl = getWebSocketUrl();
    console.log('Attempting to connect to WebSocket:', wsUrl);
    
    try {
      const newSocket = new WebSocket(wsUrl);
      socketRef.current = newSocket;

      newSocket.onopen = (event) => {
        console.log('WebSocket Connected');
        setIsConnected(true);
        setReconnectAttempts(0);
        lastPongRef.current = Date.now();
        toast.success('트레이딩 봇에 연결되었습니다');
        checkStatus();
        
        heartbeatIntervalRef.current = setInterval(() => {
          sendHeartbeat();
          checkConnection();
        }, 10000);
      };

      newSocket.onmessage = (event) => {
        try {
          // 상세한 메시지 로깅 추가
          console.group('📨 WebSocket Message Received');
          console.log('📅 Timestamp:', new Date().toISOString());
          console.log('🌐 Connection State:', newSocket.readyState);
          console.log('📦 Raw Data:', event.data);
          
          let message;
          try {
            message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            console.log('📝 Parsed Message:', message);
          } catch (e) {
            console.warn('⚠️ Could not parse message as JSON, treating as raw text');
            message = event.data;
          }
          
          console.groupEnd();
          
          // PONG 메시지 처리
          if (message && message.type === 'pong' || message.type === 'connection') {
            lastPongRef.current = Date.now();
            if (message.type === 'pong') {
              console.log('🏓 Pong received');
            } else if (message.type === 'connection') {
              console.log('🔌 Connection message received');
            }
            return;
          }
          
          // 로그 메시지 처리
          console.log('📢 Log Message:', message);
          
          // ✅ 백엔드 메시지 형식에 맞게 처리
          if (message.type === 'log') {
            // 메시지 리스트에 추가
            setMessages(prev => [message, ...prev].slice(0, 100));
            
            // 부모 컴포넌트에 전달
            if (onMessage) {
              onMessage(message);
            }
            
            // 로그 레벨에 따른 토스트 알림
            if (message.level === 'error') {
              toast.error(message.message);
            } else if (message.level === 'warning') {
              toast.warning(message.message);
            } else if (message.message.includes('✅') || message.message.includes('진입') || message.message.includes('청산')) {
              // 중요 이벤트만 토스트로 표시
              toast.info(message.message);
            }
          }
          // 기존 order, error 타입도 유지 (혹시 다른 곳에서 사용할 경우)
          else if (message.type === 'order') {
            toast.info(`주문 실행: ${message.data.side} ${message.data.amount} ${message.data.symbol}`);
            setMessages(prev => [message, ...prev].slice(0, 100));
          } else if (message.type === 'error') {
            toast.error(`에러: ${message.data}`);
            setMessages(prev => [message, ...prev].slice(0, 100));
          }
          
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      newSocket.onclose = (event) => {
        const closeEvent = {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: new Date().toISOString(),
          url: wsUrl
        };
        console.log('WebSocket Disconnected:', closeEvent);
        
        // Handle specific error codes
        if (event.code === 1006 || !event.wasClean) {
          console.error('WebSocket connection failed. Is the server running?', {
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean
          });
          toast.error('웹소켓 서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.');
        }
        
        setIsConnected(false);
        
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        if (event.code !== 1000 && event.code !== 1005 && event.code !== 4000) {  
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          
          toast.warning(
            `트레이딩 봇 연결이 끊어졌습니다. ${Math.ceil(delay/1000)}초 후 재연결을 시도합니다...`,
            { autoClose: delay - 1000 }
          );
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        }
      };

      newSocket.onerror = (error) => {
        console.error('WebSocket Error:', {
          error,
          readyState: newSocket.readyState,
          url: wsUrl,
          timestamp: new Date().toISOString()
        });
        toast.error(`웹소켓 연결 오류: ${error.message || '알 수 없는 오류'}`);
      };

      // No need to close here as we're just setting up the connection
      // The error handling is already managed in the onerror handler
      
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        connectWebSocket();
      }, delay);
    }
  }, [reconnectAttempts, checkStatus, onMessage, checkConnection, sendHeartbeat]);

  useEffect(() => {
    if (botStatus?.isOnline && 
        (socketRef.current === null || socketRef.current.readyState === WebSocketState.CLOSED)) {
      console.log('Server is online. Attempting initial or full reconnection...');
      connectWebSocket();
    }
  }, [botStatus?.isOnline, connectWebSocket]);

  useEffect(() => {
    return () => {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (socketRef.current) {
        if (socketRef.current.readyState === WebSocket.OPEN || 
            socketRef.current.readyState === WebSocket.CONNECTING) {
          socketRef.current.close(1000, 'Component unmounting cleanup');
        }
        socketRef.current = null;
      }
    };
  }, []); 

  return (
    <div>
      <div className="bot-status mb-4">
        <div className="flex items-center gap-3">
          <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 연결됨' : '🔴 연결 끊김'}
          </div>
          {botStatus && ( 
            <div className={`bot-indicator ${botStatus.status}`}>
              {botStatus.status === 'running' ? '🤖 봇 실행중' : '⏸️ 봇 중지'} 
            </div>
          )}
        </div>
      </div>

      <ToastContainer 
        position="top-right" 
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />

      {/* ✅ 개선된 메시지 표시 */}
      <div className="message-list mt-4 max-h-96 overflow-y-auto border rounded-lg p-3 bg-gray-50">
        <h3 className="text-sm font-semibold mb-2 text-gray-700">실시간 로그</h3>
        {messages.length === 0 ? (
          <div className="text-center text-gray-400 py-4">
            대기 중...
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div 
              key={idx} 
              className={`message p-2 mb-2 text-sm rounded ${
                msg.level === 'error' ? 'bg-red-50 text-red-700 border-l-4 border-red-500' : 
                msg.level === 'warning' ? 'bg-yellow-50 text-yellow-700 border-l-4 border-yellow-500' : 
                'bg-white text-gray-700 border-l-4 border-blue-500'
              }`}
            >
              <div className="flex items-start">
                <span className="timestamp text-gray-500 text-xs mr-2 flex-shrink-0">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
                <span className="content whitespace-pre-wrap flex-1">
                  {msg.message || JSON.stringify(msg.data)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default WebSocketConnection;
