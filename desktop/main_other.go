//go:build !windows

package main

import (
	"fmt"
	"os"
	"os/signal"
)

// Для проверки на Linux/macOS: просто запускаем сервер.
func main() {
	url, err := startServer()
	if err != nil {
		fmt.Println("ошибка:", err)
		os.Exit(1)
	}
	fmt.Println("Vesna:", url)
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt)
	<-c
}
