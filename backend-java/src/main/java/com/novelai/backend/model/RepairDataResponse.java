package com.novelai.backend.model;

public class RepairDataResponse extends GenericResponse {

    private int repaired;
    private int lastChapterNumber;

    public int getRepaired() {
        return repaired;
    }

    public void setRepaired(int repaired) {
        this.repaired = repaired;
    }

    public int getLastChapterNumber() {
        return lastChapterNumber;
    }

    public void setLastChapterNumber(int lastChapterNumber) {
        this.lastChapterNumber = lastChapterNumber;
    }
}
