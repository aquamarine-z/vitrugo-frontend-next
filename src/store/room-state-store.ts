import {atom} from "jotai";


export const RoomStateStore = atom({
    subtitle: "",
    subtitleVisible: false,
    websocket: undefined as WebSocket | undefined,
    isRecording: false,
    isConnected:false,
    sessionId: undefined as number | undefined, // 新增字段
})