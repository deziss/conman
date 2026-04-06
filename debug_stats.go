package main

import (
	"flag"
	"log"
	"net/url"
    "os"
    "os/signal"

	"github.com/gorilla/websocket"
)

func main() {
    target := flag.String("url", "ws://192.168.122.235:9091/api/stats?id=b00ec4cf8d95", "websocket url")
    flag.Parse()

	u, err := url.Parse(*target)
	if err != nil {
		log.Fatal(err)
	}
    log.Printf("connecting to %s", u.String())

	c, _, err := websocket.DefaultDialer.Dial(u.String(), nil)
	if err != nil {
		log.Fatal("dial:", err)
	}
	defer c.Close()

    // Read one message
    _, message, err := c.ReadMessage()
    if err != nil {
        log.Println("read:", err)
        return
    }
    log.Printf("received: %s", message)
    
    // Keep reading to see if it continues
    go func() {
        for {
            _, _, err := c.ReadMessage()
            if err != nil {
                return
            }
        }
    }()
    
    interrupt := make(chan os.Signal, 1)
    signal.Notify(interrupt, os.Interrupt)
    <-interrupt
}
