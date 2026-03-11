package com.agent.websocket;

import com.agent.service.AgentRequestService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicReference;

/**
 * WebSocket handler for communicating with the Chrome extension background script.
 *
 * This is intentionally simple for the MVP: it keeps a single active session and
 * forwards PRODUCT_SNAPSHOT messages to the AgentRequestService.
 */
public class AgentWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(AgentWebSocketHandler.class);

    private final AgentRequestService agentRequestService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private final AtomicReference<WebSocketSession> activeSession = new AtomicReference<>();

    public AgentWebSocketHandler(AgentRequestService agentRequestService) {
        this.agentRequestService = agentRequestService;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        activeSession.set(session);
        log.info("Chrome extension connected: {}", session.getId());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        if (activeSession.compareAndSet(session, null)) {
            log.info("Chrome extension disconnected: {}", session.getId());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String payload = message.getPayload();
        log.debug("Received WebSocket message: {}", payload);
        agentRequestService.handleSnapshotMessage(payload);
    }

    /**
     * Sends a REQUEST_SNAPSHOT command to the active extension session.
     *
     * @param requestId unique request id
     * @param url       optional URL to open before extracting the product
     * @throws IllegalStateException if no session is connected
     */
    public void sendRequestSnapshot(String requestId, String url) {
        WebSocketSession session = activeSession.get();
        if (session == null || !session.isOpen()) {
            throw new IllegalStateException("No active Chrome extension WebSocket session");
        }
        try {
            var node = objectMapper.createObjectNode();
            node.put("type", "REQUEST_SNAPSHOT");
            node.put("requestId", requestId);
            if (url != null && !url.isBlank()) {
                node.put("url", url);
            }
            String json = objectMapper.writeValueAsString(node);
            session.sendMessage(new TextMessage(json));
            log.debug("Sent REQUEST_SNAPSHOT for requestId={}", requestId);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to send REQUEST_SNAPSHOT", e);
        }
    }

    /**
     * Sends a REQUEST_LATEST_PRODUCTS command to the active extension session.
     *
     * @param requestId unique request id
     * @throws IllegalStateException if no session is connected
     */
    public void sendRequestLatestProducts(String requestId) {
        WebSocketSession session = activeSession.get();
        if (session == null || !session.isOpen()) {
            throw new IllegalStateException("No active Chrome extension WebSocket session");
        }
        try {
            var node = objectMapper.createObjectNode();
            node.put("type", "REQUEST_LATEST_PRODUCTS");
            node.put("requestId", requestId);
            node.put("url", "https://www.chotot.com/mua-ban-do-dien-tu?f=p&sp=0&page=1");
            String json = objectMapper.writeValueAsString(node);
            session.sendMessage(new TextMessage(json));
            log.debug("Sent REQUEST_LATEST_PRODUCTS for requestId={}", requestId);
        } catch (IOException e) {
            throw new IllegalStateException("Failed to send REQUEST_LATEST_PRODUCTS", e);
        }
    }
}

