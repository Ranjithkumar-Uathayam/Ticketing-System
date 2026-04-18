param(
  [int]$Port = 17951,
  [string]$DefaultPrinterName = 'TSC TTP-244 Pro'
)

$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;

public static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    private class DOCINFO
    {
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)]
        public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool OpenPrinter(string pPrinterName, out IntPtr phPrinter, IntPtr pDefault);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In] DOCINFO di);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", SetLastError = true)]
    private static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendStringToPrinter(string printerName, string content, string docName)
    {
        byte[] bytes = Encoding.ASCII.GetBytes(content ?? string.Empty);
        IntPtr printerHandle;
        if (!OpenPrinter(printerName, out printerHandle, IntPtr.Zero))
        {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Unable to open printer.");
        }

        try
        {
            DOCINFO docInfo = new DOCINFO();
            docInfo.pDocName = string.IsNullOrWhiteSpace(docName) ? "HW Label" : docName;
            docInfo.pDataType = "RAW";

            if (!StartDocPrinter(printerHandle, 1, docInfo))
            {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Unable to start print document.");
            }

            try
            {
                if (!StartPagePrinter(printerHandle))
                {
                    throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Unable to start print page.");
                }

                IntPtr unmanagedBytes = Marshal.AllocCoTaskMem(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, unmanagedBytes, bytes.Length);
                    int written;
                    if (!WritePrinter(printerHandle, unmanagedBytes, bytes.Length, out written) || written != bytes.Length)
                    {
                        throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(), "Unable to write raw bytes to printer.");
                    }
                }
                finally
                {
                    Marshal.FreeCoTaskMem(unmanagedBytes);
                    EndPagePrinter(printerHandle);
                }
            }
            finally
            {
                EndDocPrinter(printerHandle);
            }
        }
        finally
        {
            ClosePrinter(printerHandle);
        }
    }
}
"@

function ConvertTo-JsonBytes {
  param([hashtable]$Body)

  return [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 10))
}

function Send-HttpResponse {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [hashtable]$Body,
    [string]$StatusText = 'OK'
  )

  $payload = ConvertTo-JsonBytes $Body
  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText",
    'Content-Type: application/json; charset=utf-8',
    "Content-Length: $($payload.Length)",
    'Connection: close',
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Headers: Content-Type, Authorization',
    'Access-Control-Allow-Methods: GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network: true',
    ''
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes("$headers`r`n")
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Write($payload, 0, $payload.Length)
  $Stream.Flush()
}

function Send-EmptyResponse {
  param(
    [System.Net.Sockets.NetworkStream]$Stream,
    [int]$StatusCode,
    [string]$StatusText = 'No Content'
  )

  $headers = @(
    "HTTP/1.1 $StatusCode $StatusText",
    'Content-Length: 0',
    'Connection: close',
    'Access-Control-Allow-Origin: *',
    'Access-Control-Allow-Headers: Content-Type, Authorization',
    'Access-Control-Allow-Methods: GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network: true',
    '',
    ''
  ) -join "`r`n"

  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
  $Stream.Flush()
}

function Read-HttpRequest {
  param([System.Net.Sockets.TcpClient]$Client)

  $stream = $Client.GetStream()
  $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8, $false, 8192, $true)

  $requestLine = $reader.ReadLine()
  if ([string]::IsNullOrWhiteSpace($requestLine)) {
    return $null
  }

  $parts = $requestLine.Split(' ')
  $method = $parts[0]
  $path = ($parts[1].Split('?')[0]).Trim()
  $headers = @{}

  while ($true) {
    $line = $reader.ReadLine()
    if ($line -eq $null -or $line -eq '') {
      break
    }

    $separatorIndex = $line.IndexOf(':')
    if ($separatorIndex -gt 0) {
      $name = $line.Substring(0, $separatorIndex).Trim().ToLowerInvariant()
      $value = $line.Substring($separatorIndex + 1).Trim()
      $headers[$name] = $value
    }
  }

  $body = ''
  $contentLength = 0
  if ($headers.ContainsKey('content-length')) {
    [void][int]::TryParse($headers['content-length'], [ref]$contentLength)
  }

  if ($contentLength -gt 0) {
    $buffer = New-Object char[] $contentLength
    $offset = 0
    while ($offset -lt $contentLength) {
      $read = $reader.Read($buffer, $offset, $contentLength - $offset)
      if ($read -le 0) { break }
      $offset += $read
    }

    if ($offset -gt 0) {
      $body = -join $buffer[0..($offset - 1)]
    }
  }

  return @{
    Stream = $stream
    Method = $method
    Path = $path
    Headers = $headers
    Body = $body
  }
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()

Write-Host "HW label print agent listening on http://127.0.0.1:$Port"
Write-Host "Default printer: $DefaultPrinterName"

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $request = Read-HttpRequest -Client $client
      if ($null -eq $request) {
        continue
      }

      $stream = $request.Stream

      if ($request.Method -eq 'OPTIONS') {
        Send-EmptyResponse -Stream $stream -StatusCode 204
        continue
      }

      if ($request.Method -eq 'GET' -and ($request.Path -eq '/health' -or $request.Path -eq '/api/health' -or $request.Path -eq '/')) {
        Send-HttpResponse -Stream $stream -StatusCode 200 -Body @{
          status = 'ok'
          printerName = $DefaultPrinterName
          port = $Port
        }
        continue
      }

      if ($request.Method -eq 'POST' -and $request.Path -eq '/api/print-jobs') {
        if ([string]::IsNullOrWhiteSpace($request.Body)) {
          throw 'Request body is required.'
        }

        $payload = $request.Body | ConvertFrom-Json
        $content = [string]$payload.content
        if ([string]::IsNullOrWhiteSpace($content)) {
          throw 'content is required.'
        }

        $printerName = if ([string]::IsNullOrWhiteSpace([string]$payload.printerName)) {
          $DefaultPrinterName
        } else {
          [string]$payload.printerName
        }

        $jobName = if ([string]::IsNullOrWhiteSpace([string]$payload.jobName)) {
          'HW Label'
        } else {
          [string]$payload.jobName
        }

        [RawPrinterHelper]::SendStringToPrinter($printerName, $content, $jobName)

        Send-HttpResponse -Stream $stream -StatusCode 200 -Body @{
          message = "Label sent to printer: $printerName"
        }
        continue
      }

      Send-HttpResponse -Stream $stream -StatusCode 404 -StatusText 'Not Found' -Body @{
        message = 'Not found.'
      }
    } catch {
      try {
        if ($request -and $request.Stream) {
          Send-HttpResponse -Stream $request.Stream -StatusCode 500 -StatusText 'Internal Server Error' -Body @{
            message = $_.Exception.Message
          }
        }
      } catch {
      }
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
