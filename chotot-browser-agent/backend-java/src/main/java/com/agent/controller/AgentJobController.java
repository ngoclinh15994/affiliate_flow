package com.agent.controller;

import com.agent.model.AgentJob;
import com.agent.model.AgentJobType;
import com.agent.model.ListingItem;
import com.agent.model.ProductSnapshot;
import com.agent.service.AgentRequestService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/agent")
public class AgentJobController {

    private static final Logger log = LoggerFactory.getLogger(AgentJobController.class);

    private final AgentRequestService agentRequestService;

    public AgentJobController(AgentRequestService agentRequestService) {
        this.agentRequestService = agentRequestService;
    }

    /**
     * Poll the next job for the extension to execute.
     * Returns 204 if no job is available.
     */
    @PostMapping("/poll")
    public ResponseEntity<?> pollJob() {
        AgentJob job = agentRequestService.pollNextJob();
        if (job == null) {
            return ResponseEntity.noContent().build();
        }

        Map<String, Object> body = new java.util.HashMap<>();
        body.put("jobId", job.getId());
        body.put("type", job.getType().name());
        if (job.getUrl() != null) {
            body.put("url", job.getUrl());
        }

        return ResponseEntity.ok(body);
    }

    /**
     * Receive the result of a previously assigned job from the extension.
     */
    @PostMapping("/result")
    public ResponseEntity<?> submitResult(@RequestBody Map<String, Object> body) {
        try {
            String jobId = (String) body.get("jobId");
            String type = (String) body.get("type");
            Object payload = body.get("payload");

            if (jobId == null || type == null) {
                return ResponseEntity.badRequest().body("jobId and type are required");
            }

            AgentJobType jobType = AgentJobType.valueOf(type);

            if (jobType == AgentJobType.SNAPSHOT) {
                // payload is a map representing ProductSnapshot
                @SuppressWarnings("unchecked")
                Map<String, Object> map = (Map<String, Object>) payload;
                ProductSnapshot snapshot = new ProductSnapshot();
                snapshot.setTitle((String) map.get("title"));
                snapshot.setPrice((String) map.get("price"));
                snapshot.setRating((String) map.get("rating"));
                snapshot.setSold((String) map.get("sold"));
                snapshot.setShop((String) map.get("shop"));
                snapshot.setDescription((String) map.get("description"));
                snapshot.setPhoneNumber((String) map.get("phoneNumber"));
                @SuppressWarnings("unchecked")
                List<String> images = (List<String>) map.get("images");
                if (images != null) {
                    snapshot.setImages(images);
                }

                agentRequestService.completeSnapshotJob(jobId, snapshot);
            } else if (jobType == AgentJobType.LATEST_PRODUCTS) {
                // payload is a list of ListingItem-like maps
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> list = (List<Map<String, Object>>) payload;
                List<ListingItem> items = list.stream().map(m -> {
                    ListingItem item = new ListingItem();
                    item.setTitle((String) m.get("title"));
                    item.setPrice((String) m.get("price"));
                    item.setLocation((String) m.get("location"));
                    item.setImage((String) m.get("image"));
                    item.setShop((String) m.get("shop"));
                    item.setNumberImage((String) m.get("numberImage"));
                    item.setDetailUrl((String) m.get("detailUrl"));
                    return item;
                }).toList();

                agentRequestService.completeLatestProductsJob(jobId, items);
            } else {
                log.warn("Unsupported job type in result: {}", type);
                return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Unsupported job type: " + type);
            }

            return ResponseEntity.accepted().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST).body("Invalid job type");
        } catch (Exception e) {
            log.error("Failed to process job result", e);
            return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body("Failed to process job result");
        }
    }
}

