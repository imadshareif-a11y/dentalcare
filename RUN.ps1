# تشغيل سريع من D:\dentel care
$Root = "D:\dentel care"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\dentalcare-backend'; npm start"
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$Root\dentalcare-frontend'; npm run dev"
Write-Host "Backend + Frontend starting. Open http://localhost:5173"
