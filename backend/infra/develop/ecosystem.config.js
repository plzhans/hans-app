// pm2 구성. **배포 루트에 이 파일이 놓인다** (deploy-backend.sh 가 같이 보낸다).
//
//   <배포경로>/
//     ecosystem.config.js     ← 이 파일
//     config/develop.env       ← 앱 설정 (deploy 가 config/develop/ 를 config/ 로 올린다)
//     bin/hansapp-api-server/      ← 번들
//     logs/                    ← pm2 로그
//
// 실행:  cd <배포경로> && pm2 startOrReload ecosystem.config.js --only develop-hansapp-api-server
//        (deploy-backend.sh 가 이 명령을 만든다)

// **경로를 하드코딩하지 않는다.** 이 파일이 배포 루트에 놓이므로 __dirname 이 곧 배포 루트다.
// 예전엔 cwd: '/opt/hansapp' 로 박아뒀는데, 배포 경로는 ~/app/hansapp-develop 이라 서로
// 어긋나 있었다. 경로가 두 곳에 있으면 반드시 어긋난다 — 여기서는 자기 위치를 쓴다.
const root = __dirname;

module.exports = {
  apps: [
    {
      // **이름 규칙: <환경>-<앱>.** 배포 스크립트가 `--only` 로 이 이름을 찍어 그 앱만 재시작한다.
      // 규칙이 없으면 앱 이름(hansapp-api-server) → pm2 이름을 옮기는 표가 어딘가 또 생기고,
      // 그 표가 언젠가 어긋난다.
      name: 'develop-hansapp-api-server',

      // root 기준 상대경로. deploy-backend.sh 가 bin/<앱>/ 에 번들을 푼다.
      script: './bin/hansapp-api-server/dist/main.js',
      cwd: root,

      exec_mode: 'cluster',
      instances: 1,

      autorestart: true,
      max_memory_restart: '2G',
      watch: false, // 운영에서는 감시하지 않는다

      kill_timeout: 5000, // graceful shutdown 대기
      listen_timeout: 10000, // 앱이 뜰 때까지 기다리는 한도

      env: {
        NODE_ENV: 'development',
        APP_ENV: 'develop',
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
