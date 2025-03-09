// app/live/layout.tsx
import {ReactNode} from 'react';
import Head from 'next/head';

interface LayoutProps {
    children: ReactNode;
}

export default function LiveLayout({children}: LayoutProps) {
    return (
        <>
            <Head>
                <title>Live2D</title>
                {/* 您还可以在此添加其他元数据，如描述、关键字等 */}
            </Head>
            {/* 在此处添加布局的其他部分，例如导航栏 */}
        {children}
        {/* 在此处添加布局的其他部分，例如页脚 */}
        </>
    );
}