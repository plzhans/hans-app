// pm2 구성. **배포 루트에 이 파일이 놓인다** (deploy-backend.sh 가 같이 보낸다).
//
//   <배포경로>/
//     ecosystem.config.js     ← 이 파일
//     .env.develop             ← 앱 설정 (배포가 같이 보낸다)
//     bin/hansapi-server/      ← 번들
//     logs/                    ← pm2 로그
//
// 실행:  cd <배포경로> && pm2 startOrReload ecosystem.config.js --only develop-hansapi-server
//        (deploy-backend.sh 가 이 명령을 만든다)

// **경로를 하드코딩하지 않는다.** 이 파일이 배포 루트에 놓이므로 __dirname 이 곧 배포 루트다.
// 예전엔 cwd: '/opt/hansapi' 로 박아뒀는데, 배포 경로는 ~/app/hansapi-develop 이라 서로
// 어긋나 있었다. 경로가 두 곳에 있으면 반드시 어긋난다 — 여기서는 자기 위치를 쓴다.
const root = __dirname;

module.exports = {
  apps: [
    {
      // **이름 규칙: <환경>-<앱>.** 배포 스크립트가 `--only` 로 이 이름을 찍어 그 앱만 재시작한다.
      // 규칙이 없으면 앱 이름(hansapi-server) → pm2 이름을 옮기는 표가 어딘가 또 생기고,
      // 그 표가 언젠가 어긋난다.
      name: 'develop-hansapi-server',

      // root 기준 상대경로. deploy-backend.sh 가 bin/<앱>/ 에 번들을 푼다.
      script: './bin/hansapi-server/dist/main.js',
      cwd: root,

      exec_mode: 'cluster',
      instances: 1,

      autorestart: true,
      max_memory_restart: '2G',
      watch: false, // 운영에서는 감시하지 않는다

      kill_timeout: 5000, // graceful shutdown 대기
      listen_timeout: 10000, // 앱이 뜰 때까지 기다리는 한도

      env: {
        // **APP_ENV 가 설정 파일을 고른다** (<배포경로>/.env.develop).
        // 없으면 DEFAULT_APP_ENV 로 떨어지는데, 그건 지금 'develop' 이라 우연히 맞을 뿐이다.
        // production 에서 빠뜨리면 **develop 설정으로 뜬다.** 반드시 명시한다.
        APP_ENV: 'develop',

        // NODE_ENV 는 별개다. swagger 노출 여부를 정한다(production 이 아니면 노출).
        NODE_ENV: 'development',
      },

      merge_logs: true,
      time: true,
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',

      min_uptime: '10s',
      max_restarts: 10,

      node_args: ['--enable-source-maps'],
    },
  ],
};
