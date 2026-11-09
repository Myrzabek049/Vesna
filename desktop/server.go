// Vesna для Windows: встроенный локальный сервер, который отдаёт веб-редактор.
package main

import (
	"embed"
	"io/fs"
	"mime"
	"net"
	"net/http"
	"strconv"
)

//go:embed all:www
var embedded embed.FS

// Фиксированный порт, чтобы адрес (origin) не менялся между запусками:
// от него зависит автосохранение проекта в IndexedDB.
const basePort = 47391

func init() {
	mime.AddExtensionType(".js", "text/javascript; charset=utf-8")
	mime.AddExtensionType(".css", "text/css; charset=utf-8")
	mime.AddExtensionType(".svg", "image/svg+xml")
	mime.AddExtensionType(".webmanifest", "application/manifest+json")
}

// startServer запускает сервер на 127.0.0.1 и возвращает адрес редактора.
func startServer() (string, error) {
	sub, err := fs.Sub(embedded, "www")
	if err != nil {
		return "", err
	}
	files := http.FileServer(http.FS(sub))
	mux := http.NewServeMux()
	mux.HandleFunc("/__vesna", func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("vesna")) })
	mux.HandleFunc("/sw.js", http.NotFound) // офлайн-кэш не нужен: файлы и так внутри exe
	mux.Handle("/", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		files.ServeHTTP(w, r)
	}))

	var ln net.Listener
	for p := basePort; p < basePort+20; p++ {
		ln, err = net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(p))
		if err == nil {
			break
		}
	}
	if ln == nil {
		return "", err
	}
	go http.Serve(ln, mux)
	return "http://" + ln.Addr().String() + "/", nil
}
