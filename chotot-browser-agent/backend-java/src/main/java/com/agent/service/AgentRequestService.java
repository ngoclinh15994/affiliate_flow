package com.agent.service;

import com.agent.model.AgentJob;
import com.agent.model.AgentJobType;
import com.agent.model.ListingItem;
import com.agent.model.ProductSnapshot;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

/**
 * Coordinates HTTP requests with the Chrome extension via a simple in-memory job queue.
 *
 * For each incoming HTTP request we:
 *  - create a jobId
 *  - enqueue a job for the extension to pick up via /api/agent/poll
 *  - wait for a result posted back via /api/agent/result
 */
@Service
public class AgentRequestService {

    private static final Logger log = LoggerFactory.getLogger(AgentRequestService.class);

    private final BlockingQueue<AgentJob> jobQueue = new LinkedBlockingQueue<>();

    private final Map<String, CompletableFuture<ProductSnapshot>> pendingSnapshotRequests = new ConcurrentHashMap<>();
    private final Map<String, CompletableFuture<List<ListingItem>>> pendingLatestProductRequests = new ConcurrentHashMap<>();

    /**
     * Registers a new snapshot job and returns its id and future.
     */
    public PendingRequest createSnapshotJob(String url) {
        String jobId = UUID.randomUUID().toString();
        AgentJob job = new AgentJob(jobId, AgentJobType.SNAPSHOT, url, Instant.now());
        jobQueue.offer(job);

        CompletableFuture<ProductSnapshot> future = new CompletableFuture<>();
        pendingSnapshotRequests.put(jobId, future);
        return new PendingRequest(jobId, future);
    }

    /**
     * Registers a new latest-products job and returns its id and future.
     */
    public PendingLatestProductsRequest createLatestProductsJob() {
        String jobId = UUID.randomUUID().toString();
        AgentJob job = new AgentJob(jobId, AgentJobType.LATEST_PRODUCTS, null, Instant.now());
        jobQueue.offer(job);

        CompletableFuture<List<ListingItem>> future = new CompletableFuture<>();
        pendingLatestProductRequests.put(jobId, future);
        return new PendingLatestProductsRequest(jobId, future);
    }

    /**
     * Polls the next job from the queue, or returns null if none are available.
     */
    public AgentJob pollNextJob() {
        return jobQueue.poll();
    }

    /**
     * Waits for a snapshot result for the given pending request.
     */
    public ProductSnapshot awaitSnapshot(PendingRequest pending, Duration timeout) throws Exception {
        try {
            return pending.future().get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } finally {
            pendingSnapshotRequests.remove(pending.jobId());
        }
    }

    /**
     * Waits for a latest-products result for the given pending request.
     */
    public List<ListingItem> awaitLatestProducts(PendingLatestProductsRequest pending, Duration timeout) throws Exception {
        try {
            return pending.future().get(timeout.toMillis(), TimeUnit.MILLISECONDS);
        } finally {
            pendingLatestProductRequests.remove(pending.jobId());
        }
    }

    /**
     * Completes a snapshot job when the extension posts a result.
     */
    public void completeSnapshotJob(String jobId, ProductSnapshot snapshot) {
        CompletableFuture<ProductSnapshot> future = pendingSnapshotRequests.remove(jobId);
        if (future != null) {
            future.complete(snapshot);
        } else {
            log.warn("No pending snapshot job found for jobId={}", jobId);
        }
    }

    /**
     * Completes a latest-products job when the extension posts a result.
     */
    public void completeLatestProductsJob(String jobId, List<ListingItem> items) {
        CompletableFuture<List<ListingItem>> future = pendingLatestProductRequests.remove(jobId);
        if (future != null) {
            future.complete(items);
        } else {
            log.warn("No pending latest-products job found for jobId={}", jobId);
        }
    }

    /**
     * Simple record-like holder for a pending snapshot request.
     */
    public record PendingRequest(String jobId, CompletableFuture<ProductSnapshot> future) {
    }

    /**
     * Simple record-like holder for a pending latest-products request.
     */
    public record PendingLatestProductsRequest(String jobId, CompletableFuture<List<ListingItem>> future) {
    }
}

