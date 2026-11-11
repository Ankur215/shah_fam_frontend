# Run the frontend

Start the Flask API first, then run:

```sh
npm install
npm start
```

The development server proxies `/api` requests to `http://localhost:5001`.
For a separately hosted API, set `REACT_APP_API_URL` to its origin before
building the frontend.
