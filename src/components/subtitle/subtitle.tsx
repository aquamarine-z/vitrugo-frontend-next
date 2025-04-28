import {useEffect, useMemo, useRef, useState} from "react";
import {useAtom} from "jotai";
import {RoomStateStore} from "@/store/room-state-store";

export function Subtitle() {
    const [chatStore] = useAtom(RoomStateStore)
    // 分割字幕为多行（每行约40字，遇标点优先换行）
    const lines = useMemo(() => {
        if (!chatStore.subtitle) return [];
        const maxLineLength = 40;
        const result: string[] = [];
        let text = chatStore.subtitle;
        while (text.length > 0) {
            let cut = Math.min(maxLineLength, text.length);
            // 优先在标点处断行
            const punctIdx = text.slice(0, cut).search(/[。！？!?,，.]/);
            if (punctIdx !== -1 && punctIdx + 1 < cut) {
                cut = punctIdx + 1;
            }
            result.push(text.slice(0, cut));
            text = text.slice(cut);
        }
        // 只保留最后6行
        return result.slice(-6);
    }, [chatStore.subtitle]);

    // 用于触发每行的淡出动画
    const [fadeKeys, setFadeKeys] = useState<number[]>([]);
    const prevLinesRef = useRef<string[]>([]);
    useEffect(() => {
        if (lines.join() !== prevLinesRef.current.join()) {
            setFadeKeys(Array(lines.length).fill(0).map(() => Math.random()));
            prevLinesRef.current = lines;
        }
    }, [lines]);

    return chatStore.subtitleVisible && lines.length > 0 ? (
        <div className={"absolute bottom-0 left-0 right-0 pb-2 bg-transparent flex flex-col items-center justify-end pointer-events-none z-50"}>
            <div className={"flex flex-col gap-1 w-fit max-w-[90vw] px-2"}>
                {lines.map((line, idx) => {
                    // 只有最上面一行模糊和透明度递减，其余行正常
                    const isTop = idx === 0 && lines.length > 1;
                    return (
                        <p
                            key={fadeKeys[idx] || idx}
                            className={`subtitle-fade text-background/80 text-lg text-center px-4 py-1 rounded-md bg-background/10 transition-all duration-700 ${
                                idx === lines.length - 1 ? 'font-bold' : ''
                            }`}
                            style={{
                                opacity: isTop ? 0.5 : 1,
                                filter: isTop ? 'blur(2.5px)' : 'none'
                            }}
                        >
                            {line}
                        </p>
                    )
                })}
            </div>
        </div>
    ) : null;
}