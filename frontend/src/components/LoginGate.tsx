import { ExternalLink, Hammer, RefreshCw } from 'lucide-react'

export default function LoginGate() {
  return (
    <div className="login-gate">
      <div className="login-card">
        <span className="logo">
          <span className="logo-icon">
            <Hammer size={18} />
          </span>
          promptLab
        </span>
        <h1>请先在个人站登录</h1>
        <p>
          promptLab 使用个人站（zhecheng.fun）账号登录。
          <br />
          登录后回到这里，刷新即可开始制作你的 Skill。
        </p>
        <div className="login-actions">
          <a className="primary login-btn" href="https://zhecheng.fun" target="_blank" rel="noreferrer">
            <ExternalLink size={14} />
            前往个人站登录
          </a>
          <button className="login-btn" onClick={() => location.reload()}>
            <RefreshCw size={14} />
            我已登录，刷新
          </button>
        </div>
      </div>
    </div>
  )
}
