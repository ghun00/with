export function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-lg rounded-modal bg-surface p-8 shadow-card">
        <h1 className="text-heading">환경 설정이 필요합니다</h1>
        <p className="mt-2 text-body text-fg-secondary">
          Supabase 연결 정보가 없어 앱을 시작할 수 없습니다. 아래 단계를 완료해주세요.
        </p>
        <ol className="mt-6 list-decimal space-y-3 pl-5 text-body text-fg">
          <li>
            <a
              href="https://supabase.com/dashboard"
              target="_blank"
              rel="noreferrer"
              className="text-accent-600 underline"
            >
              Supabase
            </a>
            에서 프로젝트를 생성합니다.
          </li>
          <li>
            <code className="rounded bg-sunken px-1.5 py-0.5 text-caption">supabase/migrations</code>의 SQL을
            순서대로 SQL Editor에서 실행합니다.
          </li>
          <li>Authentication → Providers에서 Kakao를 활성화하고 카카오 개발자 앱의 키를 등록합니다.</li>
          <li>
            프로젝트 루트에 <code className="rounded bg-sunken px-1.5 py-0.5 text-caption">.env.local</code> 파일을 만들고
            <code className="ml-1 rounded bg-sunken px-1.5 py-0.5 text-caption">VITE_SUPABASE_URL</code>,
            <code className="ml-1 rounded bg-sunken px-1.5 py-0.5 text-caption">VITE_SUPABASE_ANON_KEY</code>를 설정합니다.
          </li>
          <li>개발 서버를 재시작합니다.</li>
        </ol>
      </div>
    </div>
  )
}
