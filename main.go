package main

import (
	"log"
	"net"

	"github.com/tigerowo/infinite-canvas/config"
	"github.com/tigerowo/infinite-canvas/handler"
	"github.com/tigerowo/infinite-canvas/router"
	"github.com/tigerowo/infinite-canvas/service"
)

func main() {
	if err := config.Load(); err != nil {
		log.Fatal(err)
	}
	if err := service.EnsureDefaultAdmin(); err != nil {
		log.Fatal(err)
	}
	service.StartPromptSyncScheduler()
	service.StartCanvasProjectCleanupScheduler()
	handler.StartVideoTaskPoller()
	address := ":" + config.Cfg.Port
	if config.Cfg.ListenAddress != "" {
		address = net.JoinHostPort(config.Cfg.ListenAddress, config.Cfg.Port)
	}
	log.Fatal(router.New().Run(address))
}
