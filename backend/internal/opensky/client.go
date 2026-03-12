package opensky

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

type Client struct {
	baseURL string

	clientID     string
	clientSecret string

	http *http.Client

	token    string
	tokenExp time.Time
}

func NewClient(baseURL, clientID, clientSecret string) *Client {
	return &Client{
		baseURL:      baseURL,
		clientID:     clientID,
		clientSecret: clientSecret,
		http: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

func (c *Client) GetStatesAllBBox(ctx context.Context, lamin, lamax, lomin, lomax float64) ([]StateVector, int64, error) {
	return c.getStatesAllBBoxWithRetry(ctx, lamin, lamax, lomin, lomax, true)
}

func (c *Client) getStatesAllBBoxWithRetry(
	ctx context.Context,
	lamin, lamax, lomin, lomax float64,
	allowRetry bool,
) ([]StateVector, int64, error) {

	if err := c.ensureToken(ctx); err != nil {
		return nil, 0, err
	}

	u, err := url.Parse(c.baseURL)
	if err != nil {
		return nil, 0, err
	}

	u.Path = u.Path + "/states/all"

	q := u.Query()
	q.Set("lamin", fmt.Sprintf("%f", lamin))
	q.Set("lamax", fmt.Sprintf("%f", lamax))
	q.Set("lomin", fmt.Sprintf("%f", lomin))
	q.Set("lomax", fmt.Sprintf("%f", lomax))
	u.RawQuery = q.Encode()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return nil, 0, err
	}

	log.Printf("opensky request url: %s", req.URL.String())

	req.Header.Set("Authorization", "Bearer "+c.token)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	log.Printf("opensky response status: %d", resp.StatusCode)

	if resp.StatusCode == http.StatusTooManyRequests {

		retryAfter := parseRetryAfterSeconds(
			resp.Header.Get("X-Rate-Limit-Retry-After-Seconds"),
		)

		if allowRetry {
			log.Printf("opensky rate limited, retrying in %s", retryAfter)

			if err := sleepWithContext(ctx, retryAfter); err != nil {
				return nil, 0, err
			}

			return c.getStatesAllBBoxWithRetry(
				ctx,
				lamin,
				lamax,
				lomin,
				lomax,
				false,
			)
		}

		return nil, 0, fmt.Errorf(
			"opensky status 429, retry after %s",
			retryAfter,
		)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, 0, fmt.Errorf("opensky status %d", resp.StatusCode)
	}

	var raw StatesResponse

	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, 0, err
	}

	out := make([]StateVector, 0, len(raw.States))

	for _, row := range raw.States {
		out = append(out, decodeStateRow(row))
	}

	return out, raw.Time, nil
}

func (c *Client) ensureToken(ctx context.Context) error {

	if c.token != "" && time.Now().Before(c.tokenExp) {
		return nil
	}

	log.Println("fetching opensky oauth token")

	data := url.Values{}
	data.Set("grant_type", "client_credentials")
	data.Set("client_id", c.clientID)
	data.Set("client_secret", c.clientSecret)

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		"https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token",
		strings.NewReader(data.Encode()),
	)
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("token request failed: %d", resp.StatusCode)
	}

	var tokenResp struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return err
	}

	c.token = tokenResp.AccessToken

	c.tokenExp = time.Now().Add(
		time.Duration(tokenResp.ExpiresIn-60) * time.Second,
	)

	log.Println("opensky oauth token acquired")

	return nil
}

func parseRetryAfterSeconds(header string) time.Duration {

	const fallback = 30 * time.Second

	if header == "" {
		return fallback
	}

	secs, err := strconv.Atoi(header)
	if err != nil || secs <= 0 {
		return fallback
	}

	return time.Duration(secs) * time.Second
}

func sleepWithContext(ctx context.Context, d time.Duration) error {

	timer := time.NewTimer(d)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func decodeStateRow(row []interface{}) StateVector {

	getS := func(i int) string {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(string); ok {
				return v
			}
		}
		return ""
	}

	getSPtr := func(i int) *string {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(string); ok {
				return &v
			}
		}
		return nil
	}

	getI64 := func(i int) int64 {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(float64); ok {
				return int64(v)
			}
		}
		return 0
	}

	getI64Ptr := func(i int) *int64 {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(float64); ok {
				x := int64(v)
				return &x
			}
		}
		return nil
	}

	getF64Ptr := func(i int) *float64 {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(float64); ok {
				return &v
			}
		}
		return nil
	}

	getB := func(i int) bool {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(bool); ok {
				return v
			}
		}
		return false
	}

	getInt := func(i int) int {
		if i < len(row) && row[i] != nil {
			if v, ok := row[i].(float64); ok {
				return int(v)
			}
		}
		return 0
	}

	return StateVector{
		Icao24:        getS(0),
		Callsign:      getS(1),
		OriginCountry: getS(2),

		TimePosition: getI64Ptr(3),
		LastContact:  getI64(4),

		Longitude:    getF64Ptr(5),
		Latitude:     getF64Ptr(6),
		BaroAltitude: getF64Ptr(7),

		OnGround:     getB(8),
		Velocity:     getF64Ptr(9),
		TrueTrack:    getF64Ptr(10),
		VerticalRate: getF64Ptr(11),

		GeoAltitude: getF64Ptr(13),
		Squawk:      getSPtr(14),
		Spi:         getB(15),
		PositionSrc: getInt(16),
	}
}
