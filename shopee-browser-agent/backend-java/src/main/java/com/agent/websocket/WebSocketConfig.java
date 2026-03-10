package com.agent.websocket;

import com.agent.service.AgentRequestService;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final AgentRequestService agentRequestService;

    public WebSocketConfig(AgentRequestService agentRequestService) {
        this.agentRequestService = agentRequestService;
    }

    @Bean
    public AgentWebSocketHandler agentWebSocketHandler() {
        return new AgentWebSocketHandler(agentRequestService);
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(agentWebSocketHandler(), "/ws/agent")
                .setAllowedOrigins("*");
    }
}


