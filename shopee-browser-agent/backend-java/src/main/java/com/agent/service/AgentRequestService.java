package com.agent.service;

import com.agent.model.ProductSnapshot;
import com.agent.model.ListingItem;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

/**
 * Coordinates HTTP requests with WebSocket messages to/from the Chrome extension.
 *
 * For each incoming HTTP request we:
 *  - create a requestId
 *  - send a REQUEST_SNAPSHOT message over WebSocket
 *  - wait for a PRODUCT_SNAPSHOT response with the same requestId
 */
@Service
public class AgentRequestService {

    private static final Logger log = LoggerFactory.getLogger(AgentRequestService.class);

    private final Map<String, CompletableFuture<ProductSnapshot>> pendingRequests = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<java.util.List<ListingItem>>> pendingLatestProductRequests = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    /**
     * Registers a new pending request and returns its id and future.
     */
    public PendingRequest createPendingRequest() {
        String requestId = UUID.randomUUID().toString();
        CompletableFuture<ProductSnapshot> future = new CompletableFuture<>();
        pendingRequests.put(requestId, future);
        return new PendingRequest(requestId, future);
    }

    /**
     * Handles messages from the extension (product snapshot, latest products, etc.).
     */
    public void handleSnapshotMessage(String message) {
        try {
            JsonNode root = objectMapper.readTree(message);
            String type = root.path("type").asText(null);
            String requestId = root.path("requestId").asText(null);
            if (requestId == null) {
                log.warn("Received WebSocket message without requestId");
                return;
            }
            JsonNode payload = root.path("payload");

            if ("PRODUCT_SNAPSHOT".equals(type)) {
                ProductSnapshot snapshot = objectMapper.treeToValue(payload, ProductSnapshot.class);

                CompletableFuture<ProductSnapshot> future = pendingRequests.remove(requestId);
                if (future != null) {
                    future.complete(snapshot);
                } else {
                    log.warn("No pending PRODUCT_SNAPSHOT request found for requestId={}", requestId);
                }
            } else if ("LATEST_PRODUCTS".equals(type)) {
                java.util.List<ListingItem> items =
                        objectMapper.readerForListOf(ListingItem.class).readValue(payload.traverse());

                CompletableFuture<java.util.List<ListingItem>> future = pendingLatestProductRequests.remove(requestId);
                if (future != null) {
                    future.complete(items);
                } else {
                    log.warn("No pending LATEST_PRODUCTS request found for requestId={}", requestId);
                }
            } else {
                log.debug("Ignoring unsupported message type: {}", type);
            }
        } catch (IOException e) {
            log.error("Failed to parse snapshot message", e);
        }
    }

    /**
     * Waits for a response for the given pending request.
     */
    public ProductSnapshot awaitSnapshot(PendingRequest pending, Duration timeout) throws Exception {
        try {
            return pending.future().get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } finally {
            pendingRequests.remove(pending.requestId());
        }
    }

    /**
     * Registers a new pending latest-products request and returns its id and future.
     */
    public PendingLatestProductsRequest createPendingLatestProductsRequest() {
        String requestId = UUID.randomUUID().toString();
        CompletableFuture<java.util.List<ListingItem>> future = new CompletableFuture<>();
        pendingLatestProductRequests.put(requestId, future);
        return new PendingLatestProductsRequest(requestId, future);
    }

    /**
     * Waits for a response for the given pending latest-products request.
     */
    public java.util.List<ListingItem> awaitLatestProducts(PendingLatestProductsRequest pending, Duration timeout) throws Exception {
        try {
            return pending.future().get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } finally {
            pendingLatestProductRequests.remove(pending.requestId());
        }
    }

    /**
     * Simple record-like holder for a pending request.
     */
    public record PendingRequest(String requestId, CompletableFuture<ProductSnapshot> future) {
    }

    public record PendingLatestProductsRequest(String requestId, CompletableFuture<java.util.List<ListingItem>> future) {
    }
}

