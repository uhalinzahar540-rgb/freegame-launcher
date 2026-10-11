; Hands the language picked in the installer's language selector over to the app.
; $LANGUAGE holds the Windows LCID (e.g. 1049 = Russian). On first start the
; launcher reads this file, applies the language and deletes the file.
; The folder must match the bundle identifier (Tauri's app local data dir).

!macro NSIS_HOOK_POSTINSTALL
  CreateDirectory "$LOCALAPPDATA\org.freegame.launcher"
  FileOpen $0 "$LOCALAPPDATA\org.freegame.launcher\installer-language.txt" w
  FileWrite $0 "$LANGUAGE"
  FileClose $0
!macroend
