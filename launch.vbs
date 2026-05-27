Set WshShell = CreateObject("WScript.Shell")
' Start dashboard server silently
WshShell.Run "node server.js", 0, False
' Wait a moment then open browser
WScript.Sleep 1200
WshShell.Run "http://localhost:3099", 1, False
