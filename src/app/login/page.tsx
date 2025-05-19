"use client"
import {useState} from "react";
import {useRouter} from "next/navigation";

export default function LoginPage() {
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showRegister, setShowRegister] = useState(false);
    const [regUsername, setRegUsername] = useState("");
    const [regPassword, setRegPassword] = useState("");
    const [regAuthKey, setRegAuthKey] = useState("");
    const [regError, setRegError] = useState("");
    const [regLoading, setRegLoading] = useState(false);
    const router = useRouter();

    // 获取后端端口号
    const getBackendPort = () => {
        if (typeof window !== 'undefined') {
            return localStorage.getItem('backendPort') || '8081';
        }
        return '8081';
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");
        try {
            const port = getBackendPort();
            const res = await fetch(`http://127.0.0.1:${port}/login`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({username, password}),
                credentials: "include"
            });
            if (!res.ok) throw new Error("登录失败");
            await res.json();
            
            // 登录成功后获取用户信息
            try {
                const userRes = await fetch(`http://127.0.0.1:${port}/user`, {
                    credentials: "include"
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    if (userData.username) {
                        // 存储用户名到localStorage
                        localStorage.setItem('userName', userData.username);
                        console.log("用户名已保存:", userData.username);
                    }
                }
            } catch (userError) {
                console.error("获取用户信息失败:", userError);
            }
            
            router.replace("/live");
        } catch (e:unknown) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            setError(e.message || "登录失败");
        } finally {
            setLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegLoading(true);
        setRegError("");
        try {
            const port = getBackendPort();
            const passwordToSend = regPassword === "" ? "114514" : regPassword;
            const res = await fetch(`http://127.0.0.1:${port}/register`, {
                method: "POST",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({ username: regUsername, password: passwordToSend, auth_key: regAuthKey }),
                credentials: "include"
            });
            if (!res.ok) throw new Error("注册失败");
            setShowRegister(false);
            setRegUsername(""); setRegPassword(""); setRegAuthKey("");
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-expect-error
            setRegError(e.message || "注册失败");
        } finally {
            setRegLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-100">
            {!showRegister ? (
                <form onSubmit={handleLogin} className="bg-white p-8 rounded shadow-md w-80 flex flex-col gap-4">
                    <h2 className="text-2xl font-bold mb-4">登录</h2>
                    <input className="border p-2 rounded" placeholder="用户名" value={username} onChange={e => setUsername(e.target.value)} required />
                    <input className="border p-2 rounded" placeholder="密码" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
                    {error && <div className="text-red-500 text-sm">{error}</div>}
                    <button type="submit" className="bg-blue-500 text-white rounded p-2" disabled={loading}>{loading ? "登录中..." : "登录"}</button>
                    <button type="button" className="bg-gray-200 text-gray-700 rounded p-2 mt-2" onClick={() => setShowRegister(true)}>新建账户</button>
                </form>
            ) : (
                <form onSubmit={handleRegister} className="bg-white p-8 rounded shadow-md w-80 flex flex-col gap-4">
                    <h2 className="text-2xl font-bold mb-4">新建账户</h2>
                    <input className="border p-2 rounded" placeholder="用户名" value={regUsername} onChange={e => setRegUsername(e.target.value)} required />
                    <input className="border p-2 rounded" placeholder="密码 (可为空, 留空默认为114514)" type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)} />
                    <input className="border p-2 rounded" placeholder="auth_key" value={regAuthKey} onChange={e => setRegAuthKey(e.target.value)} required />
                    <div className="text-xs text-gray-500">* 密码可为空，留空则默认为 114514</div>
                    {regError && <div className="text-red-500 text-sm">{regError}</div>}
                    <button type="submit" className="bg-green-500 text-white rounded p-2" disabled={regLoading}>{regLoading ? "注册中..." : "注册"}</button>
                    <button type="button" className="bg-gray-200 text-gray-700 rounded p-2 mt-2" onClick={() => setShowRegister(false)}>返回登录</button>
                </form>
            )}
        </div>
    );
}
