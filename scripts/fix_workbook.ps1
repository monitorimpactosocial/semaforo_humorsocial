$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$workbookPath = "g:\Mi unidad\SEMAFORO_HUMOR_SOCIAL_PARACEL\libro_base_paracel_sondeo_semaforo.xlsx"
$backupPath = "g:\Mi unidad\SEMAFORO_HUMOR_SOCIAL_PARACEL\libro_base_paracel_sondeo_semaforo.backup.xlsx"

if (-not (Test-Path -LiteralPath $workbookPath)) {
  throw "No se encontró el archivo: $workbookPath"
}

Copy-Item -LiteralPath $workbookPath -Destination $backupPath -Force

$zip = [System.IO.Compression.ZipFile]::Open($workbookPath, [System.IO.Compression.ZipArchiveMode]::Update)

function Get-EntryText {
  param([System.IO.Compression.ZipArchive]$Archive, [string]$Name)
  $entry = $Archive.GetEntry($Name)
  if (-not $entry) { throw "No existe la entrada ZIP: $Name" }
  $stream = $entry.Open()
  try {
    $reader = New-Object System.IO.StreamReader($stream)
    $text = $reader.ReadToEnd()
    $reader.Close()
    return $text
  } finally {
    $stream.Dispose()
  }
}

function Set-EntryText {
  param(
    [System.IO.Compression.ZipArchive]$Archive,
    [string]$Name,
    [string]$Text
  )

  $existing = $Archive.GetEntry($Name)
  if ($existing) { $existing.Delete() }
  $newEntry = $Archive.CreateEntry($Name)
  $stream = $newEntry.Open()
  try {
    $writer = New-Object System.IO.StreamWriter($stream, [System.Text.UTF8Encoding]::new($false))
    $writer.Write($Text)
    $writer.Flush()
    $writer.Close()
  } finally {
    $stream.Dispose()
  }
}

function Ensure-CellNode {
  param(
    [xml]$Doc,
    [System.Xml.XmlNamespaceManager]$Ns,
    [string]$Ref
  )
  $cell = $Doc.SelectSingleNode("//a:c[@r='$Ref']", $Ns)
  if ($cell) { return $cell }
  throw "No existe la celda $Ref en el XML."
}

function Set-StringCellValue {
  param(
    [xml]$Doc,
    [System.Xml.XmlNamespaceManager]$Ns,
    [string]$Ref,
    [string]$Value
  )
  $cell = Ensure-CellNode -Doc $Doc -Ns $Ns -Ref $Ref
  $cell.SetAttribute("t", "str")
  $v = $cell.SelectSingleNode("./a:v", $Ns)
  if (-not $v) {
    $v = $Doc.CreateElement("v", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $cell.AppendChild($v) | Out-Null
  }
  $v.InnerText = $Value
}

function Set-FormulaCell {
  param(
    [xml]$Doc,
    [System.Xml.XmlNamespaceManager]$Ns,
    [string]$Ref,
    [string]$Formula,
    [int]$CachedValue
  )
  $cell = Ensure-CellNode -Doc $Doc -Ns $Ns -Ref $Ref
  $cell.RemoveAttribute("t")
  $f = $cell.SelectSingleNode("./a:f", $Ns)
  if (-not $f) {
    $f = $Doc.CreateElement("f", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $cell.AppendChild($f) | Out-Null
  }
  $f.InnerText = $Formula
  $v = $cell.SelectSingleNode("./a:v", $Ns)
  if (-not $v) {
    $v = $Doc.CreateElement("v", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")
    $cell.AppendChild($v) | Out-Null
  }
  $v.InnerText = [string]$CachedValue
}

try {
  # 1) Corregir hashes en hoja usuarios (sheet2.xml)
  $sheetUsersXml = Get-EntryText -Archive $zip -Name "xl/worksheets/sheet2.xml"
  [xml]$usersDoc = $sheetUsersXml
  $usersNs = New-Object System.Xml.XmlNamespaceManager($usersDoc.NameTable)
  $usersNs.AddNamespace("a", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  Set-StringCellValue -Doc $usersDoc -Ns $usersNs -Ref "B5" -Value "f0ce0e86206541c60bc47be815f83eba98004f63c883e6d71ff5cc929cb5f9ca"
  Set-StringCellValue -Doc $usersDoc -Ns $usersNs -Ref "B6" -Value "63d0c9782448ae86deadc3efd929b08787bfc405810d6da0b6150b76a60c35b4"
  Set-StringCellValue -Doc $usersDoc -Ns $usersNs -Ref "B7" -Value "e9aaf43f96f0dd30b6003dec1682db8355438dc0050c014ad77722fbe556e0af"

  Set-EntryText -Archive $zip -Name "xl/worksheets/sheet2.xml" -Text $usersDoc.OuterXml

  # 2) Corregir fórmulas de resumen en README (sheet1.xml)
  $sheetReadmeXml = Get-EntryText -Archive $zip -Name "xl/worksheets/sheet1.xml"
  [xml]$readmeDoc = $sheetReadmeXml
  $readmeNs = New-Object System.Xml.XmlNamespaceManager($readmeDoc.NameTable)
  $readmeNs.AddNamespace("a", "http://schemas.openxmlformats.org/spreadsheetml/2006/main")

  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D14" -Formula "MAX(COUNTA(usuarios!A:A)-3,0)" -CachedValue 3
  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D15" -Formula "MAX(COUNTA(parametros!A:A)-3,0)" -CachedValue 2
  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D16" -Formula "MAX(COUNTA(respuestas!A:A)-3,0)" -CachedValue 0
  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D17" -Formula "MAX(COUNTA(preguntas!A:A)-3,0)" -CachedValue 12
  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D18" -Formula "MAX(COUNTA(catalogo_distritos!A:A)-3,0)" -CachedValue 36
  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D19" -Formula "MAX(COUNTA(catalogo_comunidades!A:A)-3,0)" -CachedValue 42
  Set-FormulaCell -Doc $readmeDoc -Ns $readmeNs -Ref "D20" -Formula "MAX(COUNTA(catalogo_actores!A:A)-3,0)" -CachedValue 42

  Set-EntryText -Archive $zip -Name "xl/worksheets/sheet1.xml" -Text $readmeDoc.OuterXml
}
finally {
  $zip.Dispose()
}

Write-Output "OK: libro corregido y backup generado en $backupPath"
