package com.agent.model;

/**
 * Lightweight DTO representing a product item on a listing page.
 */
public class ListingItem {

    private String title;
    private String price;
    private String location;
    private String image;
    private String shop;
    private String numberImage;
    private String detailUrl;

    public ListingItem() {
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public String getPrice() {
        return price;
    }

    public void setPrice(String price) {
        this.price = price;
    }

    public String getLocation() {
        return location;
    }

    public void setLocation(String location) {
        this.location = location;
    }

    public String getImage() {
        return image;
    }

    public void setImage(String image) {
        this.image = image;
    }

    public String getShop() {
        return shop;
    }

    public void setShop(String shop) {
        this.shop = shop;
    }

    public String getNumberImage() {
        return numberImage;
    }

    public void setNumberImage(String numberImage) {
        this.numberImage = numberImage;
    }

    public String getDetailUrl() {
        if (detailUrl == null || detailUrl.isBlank()) {
            return null;
        }
        // Nếu đã là URL đầy đủ thì giữ nguyên
        if (detailUrl.startsWith("http://") || detailUrl.startsWith("https://")) {
            return detailUrl;
        }
        // Chuẩn hoá path và prepend domain Chợ Tốt
        if (detailUrl.startsWith("/")) {
            return "https://www.chotot.com" + detailUrl;
        }
        return "https://www.chotot.com/" + detailUrl;
    }

    public void setDetailUrl(String detailUrl) {
        this.detailUrl = detailUrl;
    }
}

