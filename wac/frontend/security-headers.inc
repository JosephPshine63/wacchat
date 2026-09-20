add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' wss: https://auth.wacchat.win; frame-ancestors 'none'; object-src 'none'; base-uri 'self';" always;
add_header X-Frame-Options DENY always;
add_header X-Content-Type-Options nosniff always;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
