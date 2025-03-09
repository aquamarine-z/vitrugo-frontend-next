import {atom} from "jotai";

type AudioPlayerCallback=(buffer: ArrayBuffer) => Promise<void>;
export const LiveStore = atom({
    interrupted: false,
    audioPlayer: null as AudioPlayerCallback|null,
})