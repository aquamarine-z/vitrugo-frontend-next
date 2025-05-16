import {Live2dViewerApi} from "@/components/live2d-viewer/live2d-viewer";
import React, { useEffect, useRef, useState } from "react";
import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";
import { Button } from "@/components/ui/button";

interface RoomWebsocketConnectorProps {
    live2dApi?: Live2dViewerApi;
    sidebarOpen: boolean;
    setSidebarOpen: (open: boolean) => void;
    settingsOpen: boolean;
    setSettingsOpen: (open: boolean) => void;
}

export function RoomWebsocketConnector(props: RoomWebsocketConnectorProps) {
    const [roomState, setRoomState] = useAtom(RoomStateStore)
    const subtitleTimeoutRef = useRef(null)
    const currentSubtitleRef = useRef("")
    const reconnectTimeoutRef = useRef<number>(null)
    const [, setChatStore] = useAtom(ChatStore)
    // websocketRef始终指向最新的WebSocket对象
    const websocketRef = useRef<WebSocket | undefined>(undefined);
    // map to track message index by MessageID
    const messageIndexMapRef = useRef<Record<string, number>>({});

    // 记录每个角色的加入状态（pending/success/failed）
    const [joinStatus, setJoinStatus] = useState<{[k:string]: 'pending'|'success'|'failed'|undefined}>({});

    // 连接/断开逻辑
    const handleConnect = () => {
        connectWebSocket();
    };
    const handleDisconnect = () => {
        if (roomState.websocket) {
            roomState.websocket.close();
            websocketRef.current = undefined;
            setRoomState(prev => ({ ...prev, websocket: undefined, isConnected: false }));
        }
    };

    // 连接 WebSocket
    const connectWebSocket = () => {
        try {
            if (roomState.websocket?.readyState === WebSocket.OPEN) {
                return;
            }
            const wsUrl = `ws://127.0.0.1:8081/ws`;
            const websocket = new WebSocket(wsUrl);
            websocketRef.current = websocket;
            websocket.onopen = () => {
                console.log('WebSocket 连接已建立');
                setRoomState(prev => ({ ...prev, isConnected: true }));
                reconnectAttempts = 0;
                // 建立连接后，自动发送所有已加入聊天的角色 join 请求
                const enabled = JSON.parse(localStorage.getItem('live2dEnabled') || '{}');
                Object.entries(enabled).forEach(([role, enabled]) => {
                    if (enabled) {
                        websocket.send(JSON.stringify({ type: 'join', role_name: role }));
                        setJoinStatus(prev => ({...prev, [role]: 'pending'}));
                    }
                });
            };
            websocket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const msg = JSON.parse(event.data);
                        // 处理加入/退出响应
                        if ((msg.type === 'success' || msg.type === 'error') && msg.role_name) {
                            setJoinStatus(prev => ({
                                ...prev,
                                [msg.role_name]: msg.type === 'success' ? 'success' : 'failed'
                            }));
                        }
                        // 新增：处理 user_audio_input 类型，作为用户消息加入聊天框
                        if (msg.type === 'user_audio_input') {
                            setChatStore(prev => {
                                const msgs = [...prev.messages];
                                msgs.push({
                                    content: msg.content,
                                    name: msg.RoleName || msg.role_name || '用户',
                                    type: 'user',
                                    avatar: undefined
                                });
                                return { messages: msgs };
                            });
                            return; // 已处理
                        }
                        
                        // 处理 Go 结构体 TTSMessage
                        // type TTSMessage struct {
                        //   Index      int32  `json:"index"`
                        //   MessageID  int64  `json:"message_id"`
                        //   Text       string `json:"text"`
                        //   SenderName string `json:"sender_name"`
                        //   Audio      []byte `json:"audio"`
                        // }
                        if (msg.message_id !== undefined) {
                            // 处理EOF消息情况 (audio为null，text为EOF)
                            if (msg.text === 'EOF') {
                                // 不再直接发送play_done，而是将EOF标记入队
                                let msgID = String(msg.message_id);
                                console.log('收到EOF消息:', JSON.stringify(msg));
                                enqueueAudio({eof: true, msgID}, '');
                                return; // 已处理，不再继续
                            }
                            
                            // 处理普通TTSMessage情况
                            if (msg.sender_name && msg.audio) {
                                // 是带音频的TTSMessage结构，提取发送者名称和音频
                                const sender_name = msg.sender_name;
                                enqueueAudio(msg.audio as string, sender_name);
                                
                                // 如果有文本，也需要处理
                                if (msg.text) {
                                    const id = String(msg.message_id);
                                    setChatStore(prev => {
                                        const msgs = [...prev.messages];
                                        const map = messageIndexMapRef.current;
                                        if (map[id] !== undefined) {
                                            // append content for streaming
                                            msgs[map[id]].content += msg.text;
                                        } else {
                                            // add new assistant message
                                            map[id] = msgs.length;
                                            msgs.push({ content: msg.text, name: sender_name, type: 'assistant' });
                                        }
                                        return { messages: msgs };
                                    });
                                }
                                return; // 已处理，不再继续
                            }
                        }
                        
                        // 处理传统消息格式
                        // handle audio
                        if (msg.audio) {
                            // 获取发送者名字，兼容多种字段名
                            const sender_name = msg.sender_name ?? msg.SenderName ?? 'assistant';
                            enqueueAudio(msg.audio as string, sender_name);
                        }
                        // handle text messages
                        if (msg.text) {
                            // EOF signal: refresh conversation list
                            if (msg.text === 'EOF') {
                                // 传统格式同样入队EOF标记
                                let msgID = msg.MessageID ?? msg.messageID ?? msg.msgID ?? msg.message_id;
                                console.log('传统格式收到EOF消息:', JSON.stringify(msg), '提取的msgID:', msgID);
                                if (msgID !== undefined && msgID !== null) {
                                    enqueueAudio({eof: true, msgID: String(msgID)}, '');
                                } else {
                                    console.error('传统格式无法入队EOF，msgID无效:', msgID);
                                }
                                return;
                            } else {
                                const id = String(msg.MessageID ?? msg.messageID ?? msg.msgID);
                                const sender = msg.sender_name ?? msg.SenderName ?? 'assistant';
                                setChatStore(prev => {
                                    const msgs = [...prev.messages];
                                    const map = messageIndexMapRef.current;
                                    if (map[id] !== undefined) {
                                        // append content for streaming
                                        msgs[map[id]].content += msg.text;
                                    } else {
                                        // add new assistant message
                                        map[id] = msgs.length;
                                        msgs.push({ content: msg.text, name: sender, type: 'assistant' });
                                    }
                                    return { messages: msgs };
                                });
                            }
                        }
                    } catch (e) {
                        console.error('解析消息失败:', e);
                    }
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
                // 取消自动重连逻辑
                // if (reconnectAttempts < maxReconnectAttempts) {
                //     reconnectAttempts++;
                //     console.log(`尝试第 ${reconnectAttempts} 次重连...`);
                //     reconnectTimeoutRef.current = setTimeout(connectWebSocket, 3000) as unknown as number;
                // } else {
                // }
            };
            setRoomState(prev => ({ ...prev, websocket: websocket }));
        } catch (error) {
            console.error('创建 WebSocket 连接失败:', error);
        }
    };

    // 组件级变量
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;

    // 简易音频队列及播放指针
    // 支持普通音频项和EOF标记项
    const audioQueueRef = useRef<Array<{buffer?: ArrayBuffer, sender_name?: string, eof?: boolean, msgID?: string}>>([]);
    const isPlayingRef = useRef(false);

    // 顺序播放队列中的音频
    const processQueue = async () => {
        if (isPlayingRef.current || audioQueueRef.current.length === 0) return;
        const queueItem = audioQueueRef.current[0];
        if (queueItem.eof) {
            // 只有在没有音频正在播放时，才处理EOF并发送play_done
            audioQueueRef.current.shift();
            const msgID = queueItem.msgID;
            const ws = websocketRef.current;
            if (ws && ws.readyState === WebSocket.OPEN && msgID) {
                try {
                    const playDoneMsg = { type: 'play_done', content: String(msgID) };
                    console.log('音频真正播放到EOF，发送play_done信号:', JSON.stringify(playDoneMsg));
                    ws.send(JSON.stringify(playDoneMsg));
                    console.log('play_done信号已发送');
                } catch (error) {
                    console.error('发送play_done信号失败:', error);
                }
            } else {
                console.error('无法发送play_done信号，WebSocket未连接或msgID无效');
            }
            window.dispatchEvent(new CustomEvent('refreshConversations'));
            // reset for next message stream
            messageIndexMapRef.current = {};
            // 继续处理下一个（如果还有）
            if (audioQueueRef.current.length > 0) {
                processQueue();
            }
            return;
        }
        
        // 普通音频项，先标记为正在播放，然后才从队列中移除
        isPlayingRef.current = true;
        try {
            // 等待音频真正播放完成
            await props.live2dApi?.playAudio?.(queueItem.buffer!, queueItem.sender_name);
            // 播放完成后再移除队列项
            audioQueueRef.current.shift();
        } catch (e) {
            console.error('Audio play failed', e);
            // 发生错误时也要移除队列项，防止阻塞
            audioQueueRef.current.shift();
        }
        isPlayingRef.current = false;
        
        // 播放完成后，检查是否有EOF等待处理
        if (audioQueueRef.current.length > 0) {
            processQueue();
        }
    };

    // 从后端 JSON 消消息中解码音频并入队
    // 支持普通音频和EOF
    const enqueueAudio = (base64OrEof: string | {eof: true, msgID: string}, sender_name: string = 'default') => {
        if (typeof base64OrEof === 'object' && base64OrEof.eof) {
            audioQueueRef.current.push({ eof: true, msgID: base64OrEof.msgID });
            processQueue();
            return;
        }
        const binary = atob(base64OrEof as string);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        audioQueueRef.current.push({buffer: bytes.buffer, sender_name});
        processQueue();
    };

    // 新增：设置弹窗tab与live2d相关状态
    const [settingsTab, setSettingsTab] = useState<'main' | 'chat'>('main');
    const [live2dModels, setLive2dModels] = useState<any>(null);
    const [live2dLoading, setLive2dLoading] = useState(false);
    const [live2dError, setLive2dError] = useState<string | null>(null);
    const [live2dEnabled, setLive2dEnabled] = useState<{[k:string]: boolean}>(() => {
        if (typeof window !== 'undefined') {
            try {
                return JSON.parse(localStorage.getItem('live2dEnabled') || '{}');
            } catch { return {}; }
        }
        return {};
    });
    // 新增：live2d模型缩放比例
    const [live2dScale, setLive2dScale] = useState<{[k:string]: number}>(() => {
        if (typeof window !== 'undefined') {
            try {
                return JSON.parse(localStorage.getItem('live2dScale') || '{}');
            } catch { return {}; }
        }
        return {};
    });
    const handleScaleChange = (role: string, value: number) => {
        setLive2dScale(prev => {
            const next = { ...prev, [role]: value };
            localStorage.setItem('live2dScale', JSON.stringify(next));
            return next;
        });
    };
    // 新增：模型大小栏位（直接读取live2d-models.json）
    const [modelSizeList, setModelSizeList] = useState<{name: string, model: string}[]>([]);
    useEffect(() => {
        fetch('/live2d-models.json')
            .then(res => res.json())
            .then((data) => setModelSizeList(data))
            .catch(() => setModelSizeList([]));
    }, []);

    // 拉取live2d模型配置
    const fetchLive2dSetting = async () => {
        setLive2dLoading(true);
        setLive2dError(null);
        try {
            const res = await fetch('http://127.0.0.1:8081/setting', { credentials: 'include' });
            if (!res.ok) throw new Error('网络错误');
            const data = await res.json();
            setLive2dModels(data.Models || {});
        } catch (e: any) {
            setLive2dError(e.message || '获取失败');
        } finally {
            setLive2dLoading(false);
        }
    };

    // 切换tab时拉取
    useEffect(() => {
        if (settingsTab === 'chat' && live2dModels == null && !live2dLoading) {
            fetchLive2dSetting();
        }
    }, [settingsTab]);

    // 启用/关闭模型
    const toggleLive2d = (role: string) => {
        setLive2dEnabled(prev => {
            const next = { ...prev, [role]: !prev[role] };
            localStorage.setItem('live2dEnabled', JSON.stringify(next));
            return next;
        });
    };

    // 聊天管理tab按钮点击处理
    const handleToggleJoin = (role: string) => {
        if (!roomState.websocket || roomState.websocket.readyState !== WebSocket.OPEN) return;
        const enabled = !!live2dEnabled[role];
        if (enabled) {
            // 退出
            roomState.websocket.send(JSON.stringify({ type: 'exit', role_name: role }));
            setJoinStatus(prev => ({...prev, [role]: 'pending'}));
        } else {
            // 加入
            roomState.websocket.send(JSON.stringify({ type: 'join', role_name: role }));
            setJoinStatus(prev => ({...prev, [role]: 'pending'}));
        }
        // 立即切换本地按钮状态
        toggleLive2d(role);
    };

    useEffect(() => {
        return () => {
            if (roomState.websocket) {
                roomState.websocket.close();
                websocketRef.current = undefined;
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

    // 侧边栏宽度
    const SIDEBAR_WIDTH = 320;
    const buttonTransform = props.sidebarOpen ? `translateX(${SIDEBAR_WIDTH}px)` : 'none';
    const buttonTransition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';

    return <>
        {/* 齿轮按钮 */}
        <Button variant="ghost" size="icon" style={{ position: 'fixed', top: 16, left: 16, zIndex: 1000, transform: buttonTransform, transition: buttonTransition }} onClick={() => props.setSettingsOpen(true)}>
            <svg width="24" height="24" fill="none" stroke="#fff" style={{color: '#fff'}} strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 8 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 5 15.4a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 5 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 8 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09c0 .66.38 1.26 1 1.51a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.66 0 1.26.38 1.51 1H21a2 2 0 1 1 0 4h-.09c-.25 0-.48.09-.68.26z"/></svg>
        </Button>
        {/* 设置弹窗（居中圆角弹窗） */}
        {props.settingsOpen && (
            <>
                {/* 遮罩层 */}
                <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.25)', zIndex: 2000 }} onClick={() => props.setSettingsOpen(false)} />
                {/* 居中弹窗 */}
                <div style={{
                    position: 'fixed',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    minWidth: 480,
                    maxWidth: '95vw',
                    minHeight: 320,
                    background: 'var(--sidebar, #fff)',
                    color: 'var(--sidebar-foreground, #222)',
                    zIndex: 2100,
                    borderRadius: 18,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    padding: 40,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                }} onClick={e => e.stopPropagation()}>
                    {/* 右上角关闭按钮 */}
                    <Button variant="ghost" size="icon" style={{ position: 'absolute', top: 12, right: 12 }} onClick={() => props.setSettingsOpen(false)} aria-label="关闭设置">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="5" x2="15" y2="15"/><line x1="15" y1="5" x2="5" y2="15"/></svg>
                    </Button>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                        <Button variant={settingsTab === 'main' ? 'default' : 'ghost'} onClick={() => setSettingsTab('main')}>常规</Button>
                        <Button variant={settingsTab === 'chat' ? 'default' : 'ghost'} onClick={() => setSettingsTab('chat')}>聊天管理</Button>
                    </div>
                    {settingsTab === 'main' && (
                        <>
                            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>设置</div>
                            {/* 此处可添加其它设置项 */}
                            <div style={{ flex: 1 }} />
                            <div style={{marginTop: 24, padding: 16, borderRadius: 12, background: '#f7f7fa'}}>
                                <div style={{fontWeight: 600, fontSize: 16, marginBottom: 12}}>模型大小</div>
                                {modelSizeList.length === 0 && <div style={{color:'#888'}}>暂无模型配置</div>}
                                {modelSizeList.map(info => (
                                    <div key={info.name} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10}}>
                                        <span style={{minWidth: 80, fontWeight: 500}}>{info.name}</span>
                                        <input
                                            type="range"
                                            min={0.2}
                                            max={2}
                                            step={0.01}
                                            value={live2dScale[info.name] ?? 1}
                                            onChange={e => handleScaleChange(info.name, parseFloat(e.target.value))}
                                            style={{flex: 1, accentColor: '#888'}}
                                        />
                                        <span style={{width: 40, textAlign: 'right', fontSize: 13}}>{(live2dScale[info.name] ?? 1).toFixed(2)}x</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                    {settingsTab === 'chat' && (
                        <div style={{ minHeight: 200 }}>
                            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>聊天管理</div>
                            {modelSizeList.length === 0 && <div style={{color:'#888'}}>暂无模型配置</div>}
                            {modelSizeList.map(info => (
                                <div key={info.name} style={{display:'flex',alignItems:'center',gap:12,marginBottom:10,padding:12,borderRadius:8,background:'#f7f7fa'}}>
                                    <span style={{minWidth: 80, fontWeight: 500}}>{info.name}</span>
                                    <Button
                                        variant={live2dEnabled[info.name] ? 'default' : 'outline'}
                                        onClick={() => handleToggleJoin(info.name)}
                                        disabled={joinStatus[info.name] === 'pending'}
                                    >
                                        {joinStatus[info.name] === 'pending' && '处理中...'}
                                        {joinStatus[info.name] === 'success' && live2dEnabled[info.name] && '已加入聊天'}
                                        {joinStatus[info.name] === 'success' && !live2dEnabled[info.name] && '加入聊天'}
                                        {joinStatus[info.name] === 'failed' && '失败，重试'}
                                        {joinStatus[info.name] === undefined && (live2dEnabled[info.name] ? '已加入聊天' : '加入聊天')}
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </>
        )}
        {/* 连接/断开按钮 */}
        <div style={{ position: 'fixed', top: 16, left: 72, zIndex: 1000, transform: buttonTransform, transition: buttonTransition }}>
            {roomState.isConnected ? (
                <Button variant="destructive" onClick={handleDisconnect}>断开连接</Button>
            ) : (
                <Button onClick={handleConnect}>连接</Button>
            )}
        </div>
    </>
}