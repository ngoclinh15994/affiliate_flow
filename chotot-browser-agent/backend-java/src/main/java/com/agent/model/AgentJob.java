package com.agent.model;

import java.time.Instant;

public class AgentJob {

    private String id;
    private AgentJobType type;
    private String url;
    private Instant createdAt;

    public AgentJob() {
    }

    public AgentJob(String id, AgentJobType type, String url, Instant createdAt) {
        this.id = id;
        this.type = type;
        this.url = url;
        this.createdAt = createdAt;
    }

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public AgentJobType getType() {
        return type;
    }

    public void setType(AgentJobType type) {
        this.type = type;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }
}

