#ifndef AppVersion
  #define AppVersion "0.3.3"
#endif
#ifndef SourceDir
  #define SourceDir "dist\native\windows-bundle"
#endif
#ifndef OutputDir
  #define OutputDir "dist\native"
#endif

#define AppName "AI创作工作台"
#define AppExe "launcher.exe"

[Setup]
AppId={{59E595C8-8D85-48C0-92B8-3FF7DA0EA46A}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=waynehaha
AppPublisherURL=https://github.com/waynehaha/infinite-canvas
DefaultDirName={localappdata}\Programs\AI-Creative-Workbench
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
Compression=lzma2/ultra64
SolidCompression=yes
SetupIconFile={#SourceDir}\open.ico
UninstallDisplayIcon={app}\open.ico
OutputDir={#OutputDir}
OutputBaseFilename=Infinite-Canvas-v{#AppVersion}-Windows-x64-Setup

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--action start"; IconFilename: "{app}\open.ico"
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"; Parameters: "--action start"; IconFilename: "{app}\open.ico"
Name: "{group}\卸载{#AppName}"; Filename: "{uninstallexe}"

[Run]
Filename: "{app}\{#AppExe}"; Parameters: "--action start"; Description: "启动{#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{app}\{#AppExe}"; Parameters: "--action stop --no-dialog --no-tray"; Flags: runhidden waituntilterminated skipifdoesntexist

[Code]
function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  ResultCode: Integer;
  LauncherPath: String;
begin
  Result := '';
  ResultCode := 0;
  LauncherPath := ExpandConstant('{app}\{#AppExe}');
  if FileExists(LauncherPath) and
     not Exec(LauncherPath, '--action stop --no-dialog --no-tray', '', SW_HIDE,
       ewWaitUntilTerminated, ResultCode) then
    Result := '无法停止正在运行的 AI 创作工作台，请从系统托盘退出后重试。';
  if ResultCode <> 0 then
    Result := '无法停止正在运行的 AI 创作工作台，请从系统托盘退出后重试。';
end;
