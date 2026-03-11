package com.agent.controller;

import com.agent.model.ProductSnapshot;
import com.agent.model.ListingItem;
import com.agent.service.AgentRequestService;
import com.agent.service.AgentRequestService.PendingRequest;
import com.agent.service.AgentRequestService.PendingLatestProductsRequest;
import com.agent.websocket.AgentWebSocketHandler;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

@RestController
@RequestMapping("/api")
public class ProductController {

    private static final Logger log = LoggerFactory.getLogger(ProductController.class);

    private final AgentRequestService agentRequestService;
    private final AgentWebSocketHandler agentWebSocketHandler;

    public ProductController(AgentRequestService agentRequestService,
                             AgentWebSocketHandler agentWebSocketHandler) {
        this.agentRequestService = agentRequestService;
        this.agentWebSocketHandler = agentWebSocketHandler;
    }

    /**
     * GET /api/product-snapshot
     *
     * Triggers a snapshot request to the Chrome extension and waits for the response.
     */
    @GetMapping("/product-snapshot")
    public ResponseEntity<?> getProductSnapshot(
            @RequestParam(name = "url", required = false) String url) {
        PendingRequest pending = agentRequestService.createPendingRequest();

        try {
            agentWebSocketHandler.sendRequestSnapshot(pending.requestId(), url);
        } catch (IllegalStateException e) {
            log.warn("Failed to send REQUEST_SNAPSHOT: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("Chrome extension is not connected via WebSocket.");
        }

        try {
            ProductSnapshot snapshot = agentRequestService.awaitSnapshot(pending, Duration.ofSeconds(10));
            return ResponseEntity.ok(snapshot);
        } catch (Exception e) {
            log.error("Error while waiting for product snapshot", e);
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .body("Timed out waiting for product snapshot from Chrome extension.");
        }
    }

    /**
     * GET /api/latest-products
     *
     * Opens the ChoTot electronics listing page and returns a list of the latest products.
     */
    @GetMapping("/latest-products")
    public ResponseEntity<?> getLatestProducts() {
        PendingLatestProductsRequest pending = agentRequestService.createPendingLatestProductsRequest();

        try {
            agentWebSocketHandler.sendRequestLatestProducts(pending.requestId());
        } catch (IllegalStateException e) {
            log.warn("Failed to send REQUEST_LATEST_PRODUCTS: {}", e.getMessage());
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                    .body("Chrome extension is not connected via WebSocket.");
        }

        try {
            java.util.List<ListingItem> items = agentRequestService.awaitLatestProducts(pending, Duration.ofSeconds(10));
            return ResponseEntity.ok(items);
        } catch (Exception e) {
            log.error("Error while waiting for latest products", e);
            return ResponseEntity.status(HttpStatus.GATEWAY_TIMEOUT)
                    .body("Timed out waiting for latest products from Chrome extension.");
        }
    }
}

