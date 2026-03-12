FROM golang:1.22-bookworm AS build
WORKDIR /src

COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./

RUN CGO_ENABLED=0 GOOS=linux go build -o /out/api ./cmd/api

FROM gcr.io/distroless/base-debian12
WORKDIR /app

COPY --from=build /out/api /app/api
COPY --from=build /src/migrations /app/migrations

EXPOSE 8080
USER 65532:65532
ENTRYPOINT ["/app/api"]