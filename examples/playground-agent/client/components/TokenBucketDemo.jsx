/**
 * Token Bucket Algorithm Demo/Visualization Component
 * 
 * This is a learning/demo component that visualizes how the token bucket algorithm works.
 * It is not an implementation of the algorithm itself.
 */
import { useState, useEffect, useRef, useCallback } from 'react';

const MAX_TOKENS = 10;
const REFILL_RATE = 1000; // 1 token per second

export function TokenBucketDemo({ onBack }) {
  const [tokens, setTokens] = useState(MAX_TOKENS);
  const [requestCount, setRequestCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const tokensRef = useRef(MAX_TOKENS);
  const [autoMode, setAutoMode] = useState(false);
  const [message, setMessage] = useState(null);
  const [tapOpen, setTapOpen] = useState(false);
  const [tapRejected, setTapRejected] = useState(false);
  const [animatedTokens, setAnimatedTokens] = useState([]);
  const autoIntervalRef = useRef(null);
  const refillIntervalRef = useRef(null);
  const containerRef = useRef(null);
  const processingRequestRef = useRef(false);

  const showMessage = useCallback((text, isSuccess) => {
    setMessage({ text, isSuccess });
    setTimeout(() => {
      setMessage(null);
    }, 2000);
  }, []);

  const animateToken = useCallback((isConsumed) => {
    const tokenId = `token-${Date.now()}-${Math.random()}`;
    
    if (isConsumed) {
      // Open the tap
      setTapOpen(true);
      
      // Add consumed token animation
      setAnimatedTokens(prev => [...prev, { id: tokenId, type: 'consumed' }]);
      
      // Close the tap after token passes through
      setTimeout(() => {
        setTapOpen(false);
      }, 400);
      
      // Remove token after animation
      setTimeout(() => {
        setAnimatedTokens(prev => prev.filter(t => t.id !== tokenId));
      }, 800);
    } else {
      // Add refill token animation
      setAnimatedTokens(prev => [...prev, { id: tokenId, type: 'refill' }]);
      
      // Remove token after animation
      setTimeout(() => {
        setAnimatedTokens(prev => prev.filter(t => t.id !== tokenId));
      }, 1000);
    }
  }, []);

  useEffect(() => {
    // Refill tokens periodically
    refillIntervalRef.current = setInterval(() => {
      setTokens((prev) => {
        if (prev < MAX_TOKENS) {
          tokensRef.current = prev + 1;
          animateToken(false);
          return prev + 1;
        }
        return prev;
      });
    }, REFILL_RATE);

    return () => {
      if (refillIntervalRef.current) {
        clearInterval(refillIntervalRef.current);
      }
    };
  }, [animateToken]);

  const makeRequest = useCallback((silent = false) => {
    if (processingRequestRef.current) return;
    
    processingRequestRef.current = true;
    
    // Use ref to check current token count atomically
    const currentTokens = tokensRef.current;
    
    if (currentTokens > 0) {
      // Update tokens
      tokensRef.current = currentTokens - 1;
      setTokens(currentTokens - 1);
      
      // Update counter only once
      setRequestCount((c) => c + 1);
      animateToken(true);
      if (!silent) {
        showMessage('✓ Request Allowed', true);
      }
    } else {
      setRejectedCount((c) => c + 1);
      // Show rejection animation
      setTapRejected(true);
      setTimeout(() => {
        setTapRejected(false);
      }, 600);
      if (!silent) {
        showMessage('✗ Request Rejected - No Tokens!', false);
      }
    }
    
    processingRequestRef.current = false;
  }, [showMessage, animateToken]);

  const makeBurst = useCallback((silent = false) => {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        // Use ref to check tokens atomically
        const currentTokens = tokensRef.current;
        
        if (currentTokens > 0) {
          // Update tokens
          tokensRef.current = currentTokens - 1;
          setTokens(currentTokens - 1);
          
          // Update counter
          setRequestCount((c) => c + 1);
          successCount++;
          animateToken(true);
        } else {
          setRejectedCount((c) => c + 1);
          failCount++;
          // Show rejection animation
          setTapRejected(true);
          setTimeout(() => {
            setTapRejected(false);
          }, 600);
        }

        // Show message after all requests are processed
        if (i === 4 && !silent) {
          setTimeout(() => {
            if (failCount > 0) {
              showMessage(`Burst: ${successCount} consumed, ${failCount} rejected`, false);
            } else {
              showMessage(`Burst: All 5 tokens consumed!`, true);
            }
          }, 100);
        }
      }, i * 150);
    }
  }, [showMessage, animateToken]);

  useEffect(() => {
    if (!autoMode) {
      if (autoIntervalRef.current) {
        clearTimeout(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
      return;
    }

    const scheduleNextAutoRequest = () => {
      if (!autoMode) return;

      const delay = Math.random() * 2500 + 500;
      autoIntervalRef.current = setTimeout(() => {
        if (Math.random() < 0.3) {
          makeBurst(true);
        } else {
          makeRequest(true);
        }
        scheduleNextAutoRequest();
      }, delay);
    };

    scheduleNextAutoRequest();

    return () => {
      if (autoIntervalRef.current) {
        clearTimeout(autoIntervalRef.current);
      }
    };
  }, [autoMode, makeRequest, makeBurst]);

  const toggleAuto = () => {
    setAutoMode((prev) => !prev);
  };

  const reset = () => {
    setAutoMode(false);
    tokensRef.current = MAX_TOKENS;
    setTokens(MAX_TOKENS);
    setRequestCount(0);
    setRejectedCount(0);
    setMessage({ text: 'Reset complete', isSuccess: true });
    setTimeout(() => setMessage(null), 2000);
  };

  const handleTapClick = () => {
    makeRequest(autoMode);
  };

  const percentage = (tokens / MAX_TOKENS) * 100;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '0',
        color: '#09090b',
        width: '100%',
      }}
    >
      <h2
        style={{
          margin: '0 0 20px 0',
          fontSize: '13px',
          fontWeight: 600,
          color: '#09090b',
        }}
      >
        Token Bucket Algorithm
      </h2>

      <div
        style={{
          background: '#ffffff',
          borderRadius: '8px',
          padding: '24px',
          width: '100%',
          color: '#09090b',
        }}
      >
        <div
          ref={containerRef}
          style={{
            position: 'relative',
            width: '280px',
            height: '380px',
            margin: '20px auto',
          }}
        >
          {/* Faucet */}
          <div
            style={{
              position: 'absolute',
              top: '15px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '56px',
              height: '40px',
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '40px',
                height: '24px',
                background: 'linear-gradient(to bottom, #999, #666)',
                borderRadius: '6px 6px 0 0',
                boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '20px',
                height: '20px',
                background: 'linear-gradient(to bottom, #777, #444)',
                borderRadius: '0 0 6px 6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.4)',
              }}
            />
          </div>

          {/* Bucket */}
          <div
            style={{
              position: 'absolute',
              bottom: '40px',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '192px',
              height: '256px',
            }}
          >
            {/* Handle */}
            <div
              style={{
                position: 'absolute',
                bottom: '232px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '160px',
                height: '80px',
                border: '4px solid rgba(255, 255, 255, 0.5)',
                borderBottom: 'none',
                borderRadius: '80px 80px 0 0',
                boxShadow:
                  'inset 0 2px 4px rgba(255, 255, 255, 0.3), 0 2px 6px rgba(0, 0, 0, 0.2)',
              }}
            />

            {/* Rim */}
            <div
              style={{
                position: 'absolute',
                bottom: '224px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '192px',
                height: '32px',
                background:
                  'linear-gradient(to bottom, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0.5) 50%, rgba(255, 255, 255, 0.4) 100%)',
                border: '2px solid rgba(255, 255, 255, 0.7)',
                borderRadius: '8px',
                boxShadow: '0 -2px 10px rgba(0, 0, 0, 0.2), 0 2px 8px rgba(0, 0, 0, 0.15)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  left: '10px',
                  right: '10px',
                  height: '3px',
                  background: 'rgba(255, 255, 255, 0.5)',
                  borderRadius: '2px',
                }}
              />
            </div>

            {/* Bucket body */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: '176px',
                height: '224px',
                background:
                  'linear-gradient(135deg, rgba(255, 255, 255, 0.4) 0%, rgba(255, 255, 255, 0.2) 50%, rgba(255, 255, 255, 0.3) 100%)',
                border: '2px solid rgba(255, 255, 255, 0.6)',
                borderRadius: '0 0 15px 15px',
                overflow: 'hidden',
                boxShadow:
                  'inset -10px 0 20px rgba(255, 255, 255, 0.2), inset 10px 0 20px rgba(0, 0, 0, 0.1), 0 8px 20px rgba(0, 0, 0, 0.3)',
              }}
            >
              {/* Water */}
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  width: '100%',
                  height: `${percentage}%`,
                  background:
                    'linear-gradient(to top, rgba(79, 172, 254, 0.8) 0%, rgba(0, 242, 254, 0.7) 100%)',
                  transition: 'height 0.3s ease',
                  boxShadow:
                    'inset 0 10px 20px rgba(255, 255, 255, 0.3), inset 0 -10px 20px rgba(0, 0, 0, 0.2)',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: '10%',
                    right: '10%',
                    height: '8px',
                    background:
                      'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%)',
                    borderRadius: '50%',
                  }}
                />
              </div>

              {/* Scale */}
              <div
                style={{
                  position: 'absolute',
                  left: '12px',
                  bottom: '8px',
                  height: '208px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  fontWeight: 'bold',
                  color: 'rgba(255, 255, 255, 0.8)',
                  textShadow:
                    '0 1px 0 rgba(0, 0, 0, 0.4), 0 -1px 0 rgba(255, 255, 255, 0.3)',
                  zIndex: 5,
                }}
              >
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((level) => (
                  <div
                    key={level}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      transition: 'all 0.3s ease',
                      color: level <= tokens ? 'rgba(255, 255, 255, 1)' : 'rgba(255, 255, 255, 0.8)',
                      textShadow:
                        level <= tokens
                          ? '0 1px 3px rgba(0, 0, 0, 0.6), 0 0 6px rgba(255, 255, 255, 0.8)'
                          : '0 1px 0 rgba(0, 0, 0, 0.4), 0 -1px 0 rgba(255, 255, 255, 0.3)',
                    }}
                  >
                    <div
                      style={{
                        width: '20px',
                        height: '1.5px',
                        background:
                          level <= tokens
                            ? 'rgba(255, 255, 255, 0.6)'
                            : 'rgba(0, 0, 0, 0.3)',
                        boxShadow:
                          level <= tokens
                            ? '0 1px 0 rgba(255, 255, 255, 0.6), 0 0 4px rgba(255, 255, 255, 0.8)'
                            : '0 1px 0 rgba(255, 255, 255, 0.4)',
                      }}
                    />
                    <span>{level}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tap */}
          <div
            onClick={handleTapClick}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: tapRejected ? 'translateX(-50%)' : 'translateX(-50%)',
              width: '72px',
              height: '64px',
              cursor: 'pointer',
              userSelect: 'none',
              animation: tapRejected ? 'shake 0.5s ease-in-out' : 'none',
            }}
          >
            {/* Mount */}
            <div
              style={{
                position: 'absolute',
                bottom: '28px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '52px',
                height: '40px',
                background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 50%, #e8e8e8 100%)',
                borderRadius: '12px',
                boxShadow:
                  '0 4px 12px rgba(0,0,0,0.25), inset -3px -3px 8px rgba(0,0,0,0.08), inset 3px 3px 8px rgba(255,255,255,0.9)',
              }}
            />

            {/* Spout */}
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '22px',
                height: '28px',
                background: 'linear-gradient(to bottom, #f8f8f8, #e0e0e0)',
                borderRadius: '50% 50% 45% 45%',
                boxShadow:
                  '0 3px 8px rgba(0,0,0,0.2), inset -2px -2px 6px rgba(0,0,0,0.1), inset 2px 2px 6px rgba(255,255,255,0.8)',
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  bottom: '2px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '14px',
                  height: '10px',
                  background: 'linear-gradient(to bottom, #d0d0d0, #a0a0a0)',
                  borderRadius: '0 0 5px 5px',
                  boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.3)',
                }}
              />
            </div>

            {/* Handle */}
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: tapOpen
                  ? 'translateX(-50%) translateY(6px)'
                  : 'translateX(-50%)',
                width: '36px',
                height: '28px',
                background: tapRejected
                  ? 'linear-gradient(to bottom, #dc2626, #991b1b)'
                  : 'linear-gradient(to bottom, #ff4444, #cc0000)',
                borderRadius: '8px 8px 4px 4px',
                boxShadow: tapOpen
                  ? '0 1px 4px rgba(0,0,0,0.4), inset 0 1px 3px rgba(0,0,0,0.3)'
                  : tapRejected
                  ? '0 3px 8px rgba(220, 38, 38, 0.5), inset 0 2px 5px rgba(255,50,50,0.8), inset 0 -2px 5px rgba(150,0,0,0.6), 0 0 12px rgba(220, 38, 38, 0.4)'
                  : '0 3px 8px rgba(0,0,0,0.3), inset 0 2px 5px rgba(255,100,100,0.6), inset 0 -2px 5px rgba(150,0,0,0.4)',
                transition: 'all 0.2s ease',
                cursor: 'pointer',
                zIndex: 10,
              }}
            />
            
            {/* Rejection indicator */}
            {tapRejected && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '50px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: '32px',
                  height: '32px',
                  background: '#ef4444',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  color: 'white',
                  fontWeight: 'bold',
                  boxShadow: '0 4px 12px rgba(239, 68, 68, 0.5)',
                  zIndex: 15,
                  animation: 'popIn 0.3s ease-out',
                }}
              >
                ✕
              </div>
            )}

            {/* Opening indicator */}
            <div
              style={{
                position: 'absolute',
                bottom: '22px',
                left: '50%',
                transform: 'translateX(-50%)',
                width: '6px',
                height: '10px',
                background: 'radial-gradient(ellipse at top, rgba(79, 172, 254, 0.6), transparent)',
                opacity: tapOpen ? 1 : 0,
                transition: 'opacity 0.2s ease',
                filter: 'blur(1px)',
              }}
            />
          </div>

          {/* Animated tokens */}
          {animatedTokens.map((token) => (
            <div
              key={token.id}
              style={{
                position: 'absolute',
                width: token.type === 'consumed' ? '18px' : '20px',
                height: token.type === 'consumed' ? '20px' : '20px',
                background: token.type === 'consumed'
                  ? 'radial-gradient(ellipse at 40% 30%, #ff6b6b, #ff4757)'
                  : 'radial-gradient(circle at 30% 30%, #4facfe, #00f2fe)',
                borderRadius: token.type === 'consumed' ? '50% 50% 60% 40%' : '50%',
                boxShadow: token.type === 'consumed'
                  ? '0 2px 6px rgba(0,0,0,0.3), inset -1px -1px 3px rgba(0,0,0,0.2), 0 0 12px rgba(255, 71, 87, 0.8)'
                  : '0 2px 6px rgba(0,0,0,0.3), inset -1px -1px 3px rgba(0,0,0,0.2), 0 0 12px rgba(79, 172, 254, 0.8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '12px',
                zIndex: 10,
                left: '50%',
                ...(token.type === 'consumed' ? {
                  bottom: '22px',
                  animation: 'consume 0.8s ease-in forwards',
                } : {
                  top: '55px',
                  animation: 'drop 1s ease-in forwards',
                }),
              }}
            >
              💧
            </div>
          ))}
        </div>

        <style>{`
          @keyframes drop {
            0% {
              transform: translateX(-50%) translateY(0) scale(1);
              opacity: 1;
            }
            100% {
              transform: translateX(-50%) translateY(300px) scale(0.9);
              opacity: 0;
            }
          }

          @keyframes consume {
            0% {
              transform: translateX(-50%) translateY(0) scale(1);
              opacity: 1;
            }
            100% {
              transform: translateX(-50%) translateY(48px) scale(0.5);
              opacity: 0;
            }
          }

          @keyframes shake {
            0%, 100% {
              transform: translateX(-50%);
            }
            10%, 30%, 50%, 70%, 90% {
              transform: translateX(calc(-50% - 4px));
            }
            20%, 40%, 60%, 80% {
              transform: translateX(calc(-50% + 4px));
            }
          }

          @keyframes popIn {
            0% {
              transform: translateX(-50%) scale(0);
              opacity: 0;
            }
            50% {
              transform: translateX(-50%) scale(1.2);
            }
            100% {
              transform: translateX(-50%) scale(1);
              opacity: 1;
            }
          }
        `}</style>

        {/* Stats */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '10px',
            marginTop: '16px',
          }}
        >
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e4e4e7',
              padding: '12px',
              borderRadius: '6px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '4px',
                color: '#09090b',
              }}
            >
              {tokens}
            </div>
            <div style={{ fontSize: '11px', color: '#71717a' }}>Available</div>
          </div>
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e4e4e7',
              padding: '12px',
              borderRadius: '6px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '4px',
                color: '#09090b',
              }}
            >
              {requestCount}
            </div>
            <div style={{ fontSize: '11px', color: '#71717a' }}>Consumed</div>
          </div>
          <div
            style={{
              background: '#f9fafb',
              border: '1px solid #e4e4e7',
              padding: '12px',
              borderRadius: '6px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '20px',
                fontWeight: 600,
                marginBottom: '4px',
                color: '#09090b',
              }}
            >
              {rejectedCount}
            </div>
            <div style={{ fontSize: '11px', color: '#71717a' }}>Rejected</div>
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            style={{
              textAlign: 'center',
              marginTop: '16px',
              padding: '12px',
              borderRadius: '6px',
              fontWeight: 500,
              minHeight: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: message.isSuccess ? '#f0fdf4' : '#fef2f2',
              border: `1px solid ${message.isSuccess ? '#86efac' : '#fecaca'}`,
              color: message.isSuccess ? '#166534' : '#991b1b',
              transition: 'all 0.3s ease',
              fontSize: '12px',
            }}
          >
            {message.text}
          </div>
        )}

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'center',
            marginTop: '20px',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => makeRequest()}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: '1px solid #e4e4e7',
              borderRadius: '6px',
              cursor: 'pointer',
              background: '#ffffff',
              color: '#09090b',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f4f4f5';
              e.currentTarget.style.borderColor = '#d4d4d8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e4e4e7';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = '#e4e4e7';
            }}
          >
            Request (1)
          </button>
          <button
            onClick={() => makeBurst()}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: '1px solid #e4e4e7',
              borderRadius: '6px',
              cursor: 'pointer',
              background: '#ffffff',
              color: '#09090b',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f4f4f5';
              e.currentTarget.style.borderColor = '#d4d4d8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e4e4e7';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = '#e4e4e7';
            }}
          >
            Burst (5)
          </button>
          <button
            onClick={toggleAuto}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: '1px solid #e4e4e7',
              borderRadius: '6px',
              cursor: 'pointer',
              background: autoMode ? '#f4f4f5' : '#ffffff',
              color: '#09090b',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#e4e4e7';
              e.currentTarget.style.borderColor = '#d4d4d8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = autoMode ? '#f4f4f5' : '#ffffff';
              e.currentTarget.style.borderColor = '#e4e4e7';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = '#d4d4d8';
            }}
          >
            {autoMode ? 'Stop Auto' : 'Auto'}
          </button>
          <button
            onClick={reset}
            style={{
              padding: '6px 12px',
              fontSize: '12px',
              border: '1px solid #e4e4e7',
              borderRadius: '6px',
              cursor: 'pointer',
              background: '#ffffff',
              color: '#09090b',
              fontWeight: 500,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f4f4f5';
              e.currentTarget.style.borderColor = '#d4d4d8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = '#e4e4e7';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.background = '#e4e4e7';
            }}
          >
            Reset
          </button>
        </div>

        {/* Explanation */}
        <div
          style={{
            marginTop: '20px',
            padding: '12px',
            fontSize: '11px',
            lineHeight: 1.6,
            color: '#71717a',
          }}
        >
          <strong style={{ color: '#09090b', display: 'block', marginBottom: '6px' }}>How it works:</strong>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div>1. Tokens are added at a fixed rate (1 token/second in this example), determining the long-term average rate limit.</div>
            <div>2. The bucket has a maximum capacity (10 tokens). If tokens are added when full, excess tokens are discarded, not requests.</div>
            <div>3. Each request must spend tokens to proceed (in this example, 1 token per request). If tokens are available, the request proceeds and tokens are removed.</div>
            <div>4. Requests are rejected when the bucket is empty.</div>
            <div>5. Bursts up to bucket capacity are allowed before requiring token refill.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
