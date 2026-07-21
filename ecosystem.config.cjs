module.exports = {
  apps: [
    {
      name: "baebe-boo-storefront",
      cwd: "/home/ubuntu/Baebe-Boo-Storefront",
      script: "node_modules/next/dist/bin/next",
      args: "start --hostname 127.0.0.1 --port 3011",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
