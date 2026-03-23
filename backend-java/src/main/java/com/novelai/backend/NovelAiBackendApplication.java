package com.novelai.backend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;

@SpringBootApplication(exclude = {DataSourceAutoConfiguration.class})
public class NovelAiBackendApplication {

    public static void main(String[] args) {
        SpringApplication.run(NovelAiBackendApplication.class, args);
    }
}
