package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"unsafe"

	"github.com/jchv/go-webview2"
)

var (
	user32      = syscall.NewLazyDLL("user32.dll")
	messageBoxW = user32.NewProc("MessageBoxW")
)

func msgBox(title, text string, flags uintptr) int {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	r, _, _ := messageBoxW.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), flags)
	return int(r)
}

func openBrowser(url string) {
	exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}

func main() {
	url, err := startServer()
	if err != nil {
		msgBox("Vesna", "Не удалось запустить Vesna: "+err.Error(), 0x10)
		return
	}

	// Данные (автосохранение проекта, медиа) — в %LOCALAPPDATA%\Vesna
	dataDir := filepath.Join(os.Getenv("LOCALAPPDATA"), "Vesna")
	os.MkdirAll(dataDir, 0o755)

	w := webview2.NewWithOptions(webview2.WebViewOptions{
		Debug:     false,
		AutoFocus: true,
		DataPath:  dataDir,
		WindowOptions: webview2.WindowOptions{
			Title:  "Vesna — видеоредактор",
			Width:  1440,
			Height: 900,
			IconId: 1,
			Center: true,
		},
	})
	if w == nil {
		// Нет среды WebView2 (бывает на старых Windows 10) — открываем в браузере
		const yes = 6
		if msgBox("Vesna",
			"Для окна Vesna нужен компонент Microsoft Edge WebView2.\n\n"+
				"Да — открыть страницу загрузки WebView2.\nНет — открыть Vesna в браузере.", 0x24) == yes {
			openBrowser("https://developer.microsoft.com/microsoft-edge/webview2/")
			return
		}
		openBrowser(url)
		msgBox("Vesna", "Vesna открыта в браузере.\nНе закрывайте это окно, пока работаете. Нажмите ОК, чтобы выйти.", 0x40)
		return
	}
	defer w.Destroy()
	w.SetSize(1440, 900, webview2.HintNone)
	w.Navigate(url)
	w.Run()
}
