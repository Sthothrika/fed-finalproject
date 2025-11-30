Please place the attached image for Dr. Venkateswar Rao here:

- Save the image as: `venkateswar.jpg`
- Destination path in repo: `public/images/doctors/venkateswar.jpg`

If you'd like me to save the image for you, grant permission or provide a public URL. I currently updated `data/doctors.json` to reference the local file so the app will serve it once the file exists.

After placing the file you can restart the server with:

PowerShell:
```
Set-Location 'c:\Users\hp\OneDrive\Desktop\hack'; Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force } ; Start-Process -NoNewWindow -FilePath 'node' -ArgumentList 'server.js'
```

Or run the `restart:windows` npm script if available:
```
npm run restart:windows
```

Once the file is in place, visit `http://localhost:3000/doctors` to confirm the picture displays.
