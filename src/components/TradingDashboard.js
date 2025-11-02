import  { useState } from 'react';
import WebSocketConnection from './WebSocketConnection';

const TradingDashboard = () => {
  const [positions, setPositions] = useState([]);

  // WebSocket 메시지 처리
  const handleWebSocketMessage = (message) => {
    console.log('Received message:', message);
    switch (message.type) {
      case 'market_data':
        // Market data handling removed as it's not being used
        break;
      case 'position_update':
        setPositions(message.data);
        break;
      // Performance updates are not being used
      // case 'performance_update':
      //   setPerformance(message.data);
      //   break;
      default:
        break;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">자동매매 대시보드</h1>
        


        <div >
          {/* 시장 데이터 차트 */}
      

          {/* 포지션 현황 */}
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-gray-800">현재 포지션</h2>
              <span className="text-sm text-gray-500">총 {positions.length}개 포지션</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">종목</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">수량</th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">수익률</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {positions.length > 0 ? (
                    positions.map((pos, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 whitespace-nowrap text-sm font-medium text-gray-900">
                          {pos.symbol}
                        </td>
                        <td className="px-4 py-2 whitespace-nowrap text-sm text-right text-gray-500">
                          {parseFloat(pos.amount).toFixed(4)}
                        </td>
                        <td className={`px-4 py-2 whitespace-nowrap text-sm text-right font-medium ${
                          pos.pnl >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {pos.pnl >= 0 ? '+' : ''}{parseFloat(pos.pnl).toFixed(2)}%
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="3" className="px-4 py-4 text-center text-sm text-gray-500">
                        현재 오픈된 포지션이 없습니다
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* WebSocket 메시지 로그 */}
        <div className="mt-6 bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">실시간 로그</h2>
          <WebSocketConnection onMessage={handleWebSocketMessage} />
        </div>
      </div>
    </div>
  );
};

export default TradingDashboard;
