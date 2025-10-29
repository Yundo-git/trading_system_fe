import { useState, useEffect, useCallback } from 'react';

const useBotStatus = (checkInterval = 30000) => {
  const [botStatus, setBotStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const checkStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'}/trading/status`);
      
      if (!response.ok) {
        console.log('안된거',response)
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      console.log('된거',response)
      const status = await response.json();
      
      const newStatus = {
        ...status,
        isOnline: response.ok,
        lastUpdated: new Date().toISOString(),
      };
      
      setBotStatus(newStatus);
      setLastChecked(new Date().toISOString());
      return newStatus;
    } catch (error) {
      console.error('Error checking bot status:', error);
      const errorStatus = {
        status: 'offline',
        message: error.message.includes('404') ? 'API 엔드포인트를 찾을 수 없습니다' : '연결 오류',
        isOnline: false,
        lastUpdated: new Date().toISOString(),
      };
      setBotStatus(errorStatus);
      return errorStatus;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 주기적으로 상태 확인
  useEffect(() => {
    // 초기 상태 확인
    checkStatus();
    
    // 주기적 상태 확인 설정
    const intervalId = setInterval(checkStatus, checkInterval);
    
    // 클린업 함수
    return () => clearInterval(intervalId);
  }, [checkStatus, checkInterval]);

  return {
    botStatus,
    isLoading,
    lastChecked,
    checkStatus, // 수동으로 상태를 확인할 수 있도록 함수 노출
  };
};

export default useBotStatus;
