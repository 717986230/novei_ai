package com.novelai.backend.model;

public class BrowserSessionImportResponse extends GenericResponse {

    private String platform;
    private String browser;
    private String cookies;
    private Integer cookieCount;
    private String sourceUrl;

    public String getPlatform() {
        return platform;
    }

    public void setPlatform(String platform) {
        this.platform = platform;
    }

    public String getBrowser() {
        return browser;
    }

    public void setBrowser(String browser) {
        this.browser = browser;
    }

    public String getCookies() {
        return cookies;
    }

    public void setCookies(String cookies) {
        this.cookies = cookies;
    }

    public Integer getCookieCount() {
        return cookieCount;
    }

    public void setCookieCount(Integer cookieCount) {
        this.cookieCount = cookieCount;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }
}
