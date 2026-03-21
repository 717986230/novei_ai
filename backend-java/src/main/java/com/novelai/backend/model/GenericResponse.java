package com.novelai.backend.model;

public class GenericResponse {

    private boolean success;
    private String message;
    private String error;

    public static GenericResponse success(String message) {
        GenericResponse response = new GenericResponse();
        response.setSuccess(true);
        response.setMessage(message);
        return response;
    }

    public static GenericResponse failure(String error) {
        GenericResponse response = new GenericResponse();
        response.setSuccess(false);
        response.setError(error);
        return response;
    }

    public boolean isSuccess() {
        return success;
    }

    public void setSuccess(boolean success) {
        this.success = success;
    }

    public String getMessage() {
        return message;
    }

    public void setMessage(String message) {
        this.message = message;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }
}
