import { useEffect, useState, useCallback, useRef } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import useBotStatus from '../hooks/useBotStatus'; // useBotStatus 훅은 그대로 사용

// WebSocket 상태 상수
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

  // 커스텀 훅을 사용한 봇 상태 관리
  const { botStatus, checkStatus } = useBotStatus(30000);

  // 하트비트 전송
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

  // 연결 확인 (PONG 응답 체크)
  const checkConnection = useCallback(() => {
    const now = Date.now();
    const timeSinceLastPong = now - lastPongRef.current;
    
    // 30초 이상 PONG 응답이 없으면 재연결 시도
    if (timeSinceLastPong > 30000) {
      console.warn('No PONG received in 30 seconds. Reconnecting...');
      if (socketRef.current) {
        // 명시적으로 연결을 닫아 onclose 핸들러 실행
        socketRef.current.close(1006, 'Pong timeout');
      }
    }
  }, []);

  const connectWebSocket = useCallback(() => {
    // 1. 기존 재연결 시도 및 인터벌 정리
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }

    // 2. 기존 소켓 정리 (새 연결 전에 이전 소켓을 명시적으로 닫음)
    if (socketRef.current && 
        (socketRef.current.readyState === WebSocketState.OPEN || 
         socketRef.current.readyState === WebSocketState.CONNECTING)) {
      // 1000 코드는 사용하지 않고, 비정상 종료 코드를 사용하거나 그냥 close() 호출
      socketRef.current.close(4000, 'New connection attempt'); 
    }

    // 3. WebSocket URL 구성
    const wsUrl = process.env.REACT_APP_BACKEND_URL ? 
      process.env.REACT_APP_BACKEND_URL.replace('http', 'ws') + '/ws/logs' : 
      'ws://localhost:8000/ws/logs';
    
    console.log(`Connecting to WebSocket at ${wsUrl}...`);
    
    try {
      const newSocket = new WebSocket(wsUrl);
      socketRef.current = newSocket;

      newSocket.onopen = (event) => {
        console.log('WebSocket Connected');
        setIsConnected(true);
        setReconnectAttempts(0);
        lastPongRef.current = Date.now();
        toast.success('트레이딩 봇에 연결되었습니다');
        checkStatus(); // 봇 상태도 업데이트
        
        // 하트비트 설정 (10초마다 전송 및 30초마다 응답 체크)
        heartbeatIntervalRef.current = setInterval(() => {
          sendHeartbeat();
          checkConnection();
        }, 10000);
      };

      newSocket.onmessage = (event) => {
        try {
          // console.log('Received message:', event.data); // 로그가 너무 많을 경우 주석 처리
          const message = JSON.parse(event.data);
          
          // PONG 메시지 처리
          if (message.type === 'pong' || message.type === 'connection') {
            lastPongRef.current = Date.now();
            if (message.type === 'pong') {
              console.log('Received pong response');
            }
            return;
          }
          
          setMessages(prev => [message, ...prev].slice(0, 100));
          
          if (onMessage) {
            onMessage(message);
          }
          
          // 토스트 알림 로직 (그대로 유지)
          if (message.type === 'order') {
            toast.info(`주문 실행: ${message.data.side} ${message.data.amount} ${message.data.symbol}`);
          } else if (message.type === 'error') {
            toast.error(`에러: ${message.data}`);
          }
        } catch (error) {
          console.error('Error processing WebSocket message:', error);
        }
      };

      newSocket.onclose = (event) => {
        console.log('WebSocket Disconnected', {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          timestamp: new Date().toISOString()
        });
        
        setIsConnected(false);
        
        // 하트비트 인터벌 정리
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        // 정상 종료(1000) 또는 서버/프록시 종료(1005)가 아닌 경우에만 재연결 시도
        // 4000: 'New connection attempt'는 정상 종료로 간주하지 않음
        if (event.code !== 1000 && event.code !== 1005 && event.code !== 4000) {  
          // 점진적 재연결 대기 시간 (최대 30초)
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
          
          toast.warning(
            `트레이딩 봇 연결이 끊어졌습니다. ${Math.ceil(delay/1000)}초 후 재연결을 시도합니다...`,
            { autoClose: delay - 1000 }
          );
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setReconnectAttempts(prev => prev + 1);
            connectWebSocket();
          }, delay);
        } else {
          console.log('WebSocket connection closed normally or intentionally.');
        }
      };

      newSocket.onerror = (error) => {
        console.error('WebSocket Error:', { error });
        // 에러 발생 시 연결을 닫아서 onclose 핸들러가 재연결을 시도하도록 함
        if (newSocket.readyState === WebSocketState.OPEN || 
            newSocket.readyState === WebSocketState.CONNECTING) {
          newSocket.close(1006, 'WebSocket error occurred'); // 1006은 비정상 종료 코드
        }
      };
      
    } catch (error) {
      console.error('Error creating WebSocket:', error);
      // 에러 발생 시 재연결 시도
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectTimeoutRef.current = setTimeout(() => {
        setReconnectAttempts(prev => prev + 1);
        connectWebSocket();
      }, delay);
    }
  }, [reconnectAttempts, checkStatus, onMessage, checkConnection, sendHeartbeat]);

  // 서버가 온라인일 때 웹소켓 연결 시도 (최초 연결 및 재연결 담당)
  useEffect(() => {
    // 봇 상태가 온라인이고, 현재 연결이 닫힌 상태이거나 초기 상태일 때만 연결 시도
    if (botStatus?.isOnline && 
        (socketRef.current === null || socketRef.current.readyState === WebSocketState.CLOSED)) {
      console.log('Server is online. Attempting initial or full reconnection...');
      connectWebSocket();
    }
  }, [botStatus?.isOnline, connectWebSocket]);

  // Initial cleanup (컴포넌트 언마운트 시 정리만 담당)
  useEffect(() => {
    // ❌ 문제의 원인: connectWebSocket(); 호출 제거

    // 클린업 함수
    return () => {
      // 1. 하트비트 인터벌 정리
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      
      // 2. 재연결 타이머 정리
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      // 3. 소켓 연결 종료
      if (socketRef.current) {
        if (socketRef.current.readyState === WebSocket.OPEN || 
            socketRef.current.readyState === WebSocket.CONNECTING) {
          // 컴포넌트 언마운트 시 명확히 정상 종료
          socketRef.current.close(1000, 'Component unmounting cleanup');
        }
        socketRef.current = null;
      }
    };
  // 🟢 수정: 의존성 배열을 빈 배열로 만들어 오직 마운트/언마운트 시점에만 실행되게 함
  }, []); 

  return (
    <div>
      <div className="bot-status">
        {botStatus && ( 
          <div className={`status-indicator ${botStatus.status}`}>
            {botStatus.status === 'running' ? '🟢' : '🔴'} 
            {botStatus.message || `봇 상태: ${botStatus.status}`}
          </div>
        )}
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
      {/* 메시지 목록 표시 */}
      <div className="message-list mt-4 max-h-48 overflow-y-auto border rounded-lg p-2 bg-gray-50">
        {messages.map((msg, idx) => (
          <div 
            key={idx} 
            className={`message p-2 mb-1 text-sm border-b border-gray-100 ${
              msg.type === 'error' ? 'text-red-600' : 'text-gray-700'
            }`}
          >
            <span className="timestamp text-gray-500 text-xs mr-2">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
            <span className="content">
              {JSON.stringify(msg.data)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WebSocketConnection;