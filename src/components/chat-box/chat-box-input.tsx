import {Button} from "@/components/ui/button";
import {PhoneIcon, SendHorizonalIcon, SquareIcon} from "lucide-react";
import {Textarea} from "@/components/ui/textarea";
import {useEffect, useRef, useState} from "react";
import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";
import {toast} from "sonner";
import {LanguageStore} from "@/store/language-store";
import {ChatMessage, ChatStore} from "@/store/chat-message-store";

export function ChatBoxInput() {
    const [inputMessage, setInputMessage] = useState("")
    const [roomState, setRoomState] = useAtom(RoomStateStore)
    const audioContextRef = useRef(null);
    const mediaRecorderRef = useRef(null)
    const [, setChatStore] = useAtom(ChatStore)
    const language = useAtom(LanguageStore)[0].languagePack
    useEffect(() => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-expect-error
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
        return () => {
            if (audioContextRef.current) {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                //@ts-expect-error
                audioContextRef.current.close();
            }
        };
    }, []);


    const handleSend = () => {
        if (!inputMessage.trim()) return;

        if (!roomState.websocket || roomState.websocket.readyState !== WebSocket.OPEN) {
            //error('未连接到服务器，请等待重连...');
            return;
        }
        try {
            const wsMessage = {
                type: 'text',
                content: inputMessage,
                session_id: roomState.sessionId // 新增字段
            };
            setChatStore(prev => {
                // 获取用户名，优先使用localStorage中存储的值
                const userName = localStorage.getItem('userName') || '用户';
                return {
                    ...prev,
                    messages: [...prev.messages, {
                        content: inputMessage, 
                        type: "user",
                        name: userName
                    } as ChatMessage]
                }
            })

            console.log('发送消息:', wsMessage);
            roomState.websocket.send(JSON.stringify(wsMessage));
            setInputMessage('');
        } catch (error) {
            console.error('发送消息失败:', error);
        }
    };

    function convertFloat32ToInt16(buffer: Float32Array): ArrayBuffer {
        let len = buffer.length;
        if (len % 2 !== 0) len++; // 确保长度是偶数

        const int16Array = new Int16Array(len);
        for (let i = 0; i < buffer.length; i++) {
            const s = Math.max(-1, Math.min(1, buffer[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        return int16Array.buffer;
    }

    const handleToggleRecording = async () => {
        if (roomState.isRecording) {
            // 结束通话，发送 stop_call
            if (roomState.websocket && roomState.websocket.readyState === WebSocket.OPEN) {
                roomState.websocket.send(JSON.stringify({
                    type: 'stop_call',
                    session_id: roomState.sessionId
                }));
            }
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            mediaRecorderRef.current.stop();
            setRoomState(prev => {
                return {
                    ...prev,
                    isRecording: false
                }
            })
        } else {
            // 开始通话前先检查 sessionId
            if (!roomState.sessionId) {
                toast('还没有选择会话哦');
                return;
            }
            // 先发送 start_call
            if (roomState.websocket && roomState.websocket.readyState === WebSocket.OPEN) {
                roomState.websocket.send(JSON.stringify({
                    type: 'start_call',
                    session_id: roomState.sessionId
                }));
            } else {
                toast('未连接到服务器，请等待重连...');
                return;
            }
            try {
                const stream = await navigator.mediaDevices.getUserMedia({audio: true});
                const audioContext = new AudioContext({sampleRate: 16000});
                const mediaStreamSource = audioContext.createMediaStreamSource(stream);
                const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

                scriptProcessor.onaudioprocess = (event) => {
                    const inputData = event.inputBuffer.getChannelData(0);
                    const int16Data = convertFloat32ToInt16(inputData);

                    if (roomState.websocket?.readyState === WebSocket.OPEN) {
                        roomState.websocket.send(int16Data);
                    } else {
                        // 处理WebSocket断开的情况
                        console.error('WebSocket未连接');
                    }
                };

                mediaStreamSource.connect(scriptProcessor);
                scriptProcessor.connect(audioContext.destination);
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                mediaRecorderRef.current = {
                    stop: () => {
                        scriptProcessor.disconnect();
                        mediaStreamSource.disconnect();
                        stream.getTracks().forEach(track => track.stop());
                        audioContext.close();
                    }
                };

                setRoomState(prev => {
                    return {
                        ...prev,
                        isRecording: true
                    }
                })
            } catch (error) {
                console.error('麦克风访问失败:', error);
                toast('无法访问麦克风，请检查权限')
            }
        }
    };
    
    // 处理停止按钮点击事件
    const handleStop = () => {
        if (roomState.websocket && roomState.websocket.readyState === WebSocket.OPEN) {
            // 1. 发送interrupt消息到后端
            roomState.websocket.send(JSON.stringify({ type: 'interrupt' }));
            
            // 2. 执行与收到interrupt消息相同的操作
            console.log('执行停止操作，停止所有语音播放');
            
            // 如果需要访问audioQueueRef和isPlayingRef，可以通过RoomWebsocketConnector组件中的方法
            // 或者通过全局事件来通知RoomWebsocketConnector执行停止操作
            window.dispatchEvent(new CustomEvent('interrupt_audio'));
        }
    };
    return <div className={"w-full h-full flex flex-col gap-2"}>
        <div className={"w-full flex flex-row px-2 items-center justify-end gap-2"}>
            <Button onClick={handleToggleRecording}
                    className={roomState.isRecording ? "bg-red-300 hover:bg-red-200" : "bg-green-300 hover:bg-green-200" + " transition"}
                    disabled={!roomState.isConnected}><PhoneIcon/></Button>
            {/* 新增打断按钮 */}
            <Button
                disabled={!roomState.isConnected}
                className="bg-yellow-300 hover:bg-yellow-200 transition"
                onClick={() => {
                    if (roomState.websocket && roomState.websocket.readyState === WebSocket.OPEN) {
                        roomState.websocket.send(JSON.stringify({ type: 'interrupt' }));
                    }
                }}
            >打断</Button>
            {/* 新增停止按钮 */}
            <Button
                disabled={!roomState.isConnected}
                className="bg-red-500 hover:bg-red-400 transition"
                onClick={handleStop}
            ><SquareIcon size={18} /> 停止</Button>
            <div className={"grow"}/>
            <Button disabled={!roomState.isConnected} onClick={() => {
                handleSend()
            }}><SendHorizonalIcon/>{language['chat-input.message-send-button.title']}</Button>
        </div>
        <Textarea value={inputMessage} onChange={e => {
            setInputMessage(e.target.value)
        }} className={"w-full h-full resize-none"} placeholder={"Input your message here"}></Textarea>
    </div>
}