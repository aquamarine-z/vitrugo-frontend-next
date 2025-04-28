import {Live2dViewerApi} from "@/components/live2d-viewer/live2d-viewer";
import {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";
import { Button } from "@/components/ui/button";

interface RoomWebsocketConnectorProps {
    live2dApi?: Live2dViewerApi
}

export function RoomWebsocketConnector(props: RoomWebsocketConnectorProps) {
    const [roomState, setRoomState] = useAtom(RoomStateStore)
    const subtitleTimeoutRef = useRef(null)
    const currentSubtitleRef = useRef("")
    const reconnectTimeoutRef = useRef<number>(null)
    const [, setChatStore] = useAtom(ChatStore)

    // 新增本地状态
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [authCode, setAuthCode] = useState<string>("");
    const [inputAuthCode, setInputAuthCode] = useState<string>("");

    // 初始化时从 localStorage 读取认证码
    useEffect(() => {
        const saved = localStorage.getItem("authCode") || "";
        setAuthCode(saved);
        setInputAuthCode(saved);
    }, []);

    // 保存认证码到 localStorage
    const handleSaveAuthCode = () => {
        setAuthCode(inputAuthCode);
        localStorage.setItem("authCode", inputAuthCode);
        setSidebarOpen(false);
    };

    // 连接/断开逻辑
    const handleConnect = () => {
        if (!authCode) {
            alert("请先设置认证码");
            return;
        }
        connectWebSocket();
    };
    const handleDisconnect = () => {
        if (roomState.websocket) {
            roomState.websocket.close();
            setRoomState(prev => ({ ...prev, websocket: undefined, isConnected: false }));
        }
    };

    // 修改 connectWebSocket，带上认证码
    const connectWebSocket = () => {
        try {
            if (roomState.websocket?.readyState === WebSocket.OPEN) {
                return;
            }
            // 认证码通过 URL 参数传递
            const wsUrl = `ws://127.0.0.1:8080/ws?auth=${encodeURIComponent(authCode)}`;
            const websocket = new WebSocket(wsUrl);
            websocket.binaryType = 'arraybuffer';
            websocket.onopen = () => {
                console.log('WebSocket 连接已建立');
                setRoomState(prev => ({ ...prev, isConnected: true }));
                reconnectAttempts = 0;
            };
            websocket.onmessage = (event) => {
                // 处理二进制数据（MP3）
                if (event.data instanceof ArrayBuffer) {
                    console.log('收到音频数据');
                    playAudio(event.data);
                    return;
                }
                console.log('收到消息:', event.data);
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'interrupt' || data.content === 'interrupt') {
                        console.log('将interrupt改为true');
                        //setInterrupted(true);
                        props.live2dApi?.setApi?.(prev => {
                            return {...prev, interrupted: true}
                        })
                        return;
                    }
                    // 如果是结束消息（空content和包含finish_reason），则不处理
                    if (data.content === '' && data.response_meta?.finish_reason) {
                        // 当收到结束消息时，启动8秒计时器
                        if (data.response_meta?.finish_reason === 'stop') {
                            //const currentSubtitle = subtitle; // 保存当前的完整回复
                            const currentSubtitle = currentSubtitleRef.current;

                            console.log('完整的回复是', currentSubtitle);
                            const newMessage = {
                                content: currentSubtitle,
                                type: "assistant",
                                name: "AI"
                            } as ChatMessage
                            setChatStore(prev => {
                                return {
                                    ...prev,
                                    messages: [...prev.messages, newMessage]
                                }
                            })
                            currentSubtitleRef.current = ""
                            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                            // @ts-expect-error
                            subtitleTimeoutRef.current = setTimeout(() => {

                                // 将完整回复添加到聊天历史
                                setRoomState(prev => {
                                    return {
                                        ...prev,
                                        subtitle: "",
                                        subtitleVisible: false
                                    }
                                })
                            }, 8000); // 改为8秒
                        }
                        return;
                    }

                    // 只提取content内容
                    const response = data.content || '';

                    // 更新字幕，但不重置之前的内容
                    setRoomState(prev => {
                        return {
                            ...prev,
                            subtitle: prev.subtitle + response,
                            subtitleVisible: true
                        }
                    });
                    currentSubtitleRef.current += response
                    // 清除之前的定时器（如果存在）
                    if (subtitleTimeoutRef.current) {
                        clearTimeout(subtitleTimeoutRef.current);
                    }
                } catch (error) {
                    console.error('解析消息失败:', error);
                }
            };
            websocket.onerror = (error) => {
                console.error('WebSocket 错误:', error);
                setRoomState(prev => {
                    return {
                        ...prev,
                        isConnected: false,
                    }
                })
            };
            websocket.onclose = (event) => {
                console.log('WebSocket 连接已关闭, 代码:', event.code, '原因:', event.reason);
                setRoomState(prev => {
                    return {
                        ...prev,
                        isConnected: false,
                    }
                })
                if (reconnectAttempts < maxReconnectAttempts) {
                    reconnectAttempts++;
                    console.log(`尝试第 ${reconnectAttempts} 次重连...`);
                    reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000) as unknown as number;
                } else {
                }
            };
            setRoomState(prev => ({ ...prev, websocket: websocket }));
        } catch (error) {
            console.error('创建 WebSocket 连接失败:', error);
        }
    };

    // 组件级变量
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    // playAudio 函数提升到组件作用域
    const playAudio = async (arrayBuffer: ArrayBuffer) => {
        try {
            console.log('收到音频数据，大小:', arrayBuffer.byteLength);
            const blob = new Blob([arrayBuffer], {type: 'audio/mp3'});
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            await new Promise((resolve, reject) => {
                audio.oncanplaythrough = resolve;
                audio.onerror = reject;
                audio.load();
            });
            console.log('音频数据加载成功，开始播放');
            if (!props.live2dApi?.playAudio) {
                console.error('Live2D ref 未初始化');
                return;
            }
            await props.live2dApi?.playAudio?.(arrayBuffer)
            URL.revokeObjectURL(audioUrl);
        } catch (error) {
            console.error('音频播放失败:', error);
        }
    };

    // 移除自动连接 useEffect，只保留清理逻辑
    useEffect(() => {
        return () => {
            if (roomState.websocket) {
                roomState.websocket.close();
                setRoomState(prev => ({ ...prev, websocket: undefined, isConnected: false }));
            }
            if (subtitleTimeoutRef.current) {
                clearTimeout(subtitleTimeoutRef.current);
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, []);

    return <>
        {/* 齿轮按钮 */}
        <Button variant="ghost" size="icon" style={{ position: 'fixed', top: 16, left: 16, zIndex: 1000 }} onClick={() => setSidebarOpen(true)}>
            <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .66.38 1.26 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.66 0 1.26.38 1.51 1H21a2 2 0 1 1 0 4h-.09c-.25 0-.48.09-.68.26z"/></svg>
        </Button>
        {/* 侧边栏 */}
        {sidebarOpen && (
            <div style={{
                position: 'fixed', left: 0, top: 0, bottom: 0, width: 300, background: 'var(--sidebar)', color: 'var(--sidebar-foreground)', zIndex: 2000, boxShadow: '2px 0 8px rgba(0,0,0,0.08)', transition: 'transform 0.3s', transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
            }}>
                <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>设置</div>
                    <label style={{ fontSize: 14, marginBottom: 4 }}>认证码</label>
                    <input
                        type="text"
                        value={inputAuthCode}
                        onChange={e => setInputAuthCode(e.target.value)}
                        style={{ padding: 8, borderRadius: 4, border: '1px solid var(--border)', marginBottom: 8 }}
                        placeholder="请输入认证码"
                    />
                    <Button onClick={handleSaveAuthCode}>保存</Button>
                    <Button variant="ghost" onClick={() => setSidebarOpen(false)}>关闭</Button>
                </div>
            </div>
        )}
        {/* 遮罩层 */}
        {sidebarOpen && <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.15)', zIndex: 1500 }} onClick={() => setSidebarOpen(false)} />}
        {/* 连接/断开按钮 */}
        <div style={{ position: 'fixed', top: 16, left: 72, zIndex: 1000 }}>
            {roomState.isConnected ? (
                <Button variant="destructive" onClick={handleDisconnect}>断开连接</Button>
            ) : (
                <Button onClick={handleConnect}>连接</Button>
            )}
        </div>
    </>
}