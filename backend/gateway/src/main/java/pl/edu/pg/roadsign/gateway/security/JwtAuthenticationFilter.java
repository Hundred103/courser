package pl.edu.pg.roadsign.gateway.security;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import reactor.core.publisher.Mono;

@Component
public class JwtAuthenticationFilter implements GlobalFilter, Ordered {
    private final JwtService jwtService;

    public JwtAuthenticationFilter(JwtService jwtService) {
        this.jwtService = jwtService;
    }

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getPath();

        if (isPublicRequest(path, exchange.getRequest().getMethod())) {
            return chain.filter(exchange);
        }

        String authorization = exchange.getRequest().getHeaders().getFirst(HttpHeaders.AUTHORIZATION);

        if (authorization == null || !authorization.startsWith("Bearer ")) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }

        try {
            JwtClaims claims = jwtService.validate(authorization.substring("Bearer ".length()));
            ServerHttpRequest request = exchange.getRequest()
                    .mutate()
                    .headers(headers -> {
                        headers.remove("X-User-Id");
                        headers.remove("X-User-Email");
                        headers.remove("X-Username");
                        headers.set("X-User-Id", claims.userId().toString());
                        headers.set("X-User-Email", claims.email());
                        headers.set("X-Username", claims.username());
                    })
                    .build();

            return chain.filter(exchange.mutate().request(request).build());
        } catch (IllegalArgumentException e) {
            exchange.getResponse().setStatusCode(HttpStatus.UNAUTHORIZED);
            return exchange.getResponse().setComplete();
        }
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }

    private boolean isPublicRequest(String path, HttpMethod method) {
        return method == HttpMethod.OPTIONS
                || path.equals("/api/users/login")
                || path.equals("/api/users/register")
                || path.equals("/api/users/leaderboard")
                || path.equals("/api/quizzes/share-code-preview")
                || path.startsWith("/actuator");
    }
}
