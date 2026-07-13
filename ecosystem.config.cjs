module.exports = {
  apps: [
    {
      name: "aqari-web",
      cwd: "./packages/web",
      script: "src/server.ts",
      interpreter: "bun",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      restart_delay: 1000,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      env: {
        NODE_ENV: process.env.NODE_ENV || "production",
        PORT: process.env.PORT || 4200,
      },
    },
  ],
};
