# User Interface for Interactive Virtual Soundscapes

A user interface for interactive virtual soundscapes.

## Installation

Install `node.js` package dependencies:
```bash
npm install
```

## Usage

Run the server:
```bash
npm start
```

The server will start, with a default port of **9877**. For now, this is hard-coded into the server script.

Go to `localhost:9877` to run the main application script. Right now it's nothing, really.

## Development

Point your browser at `localhost:9877/development/` to see a listing of development files and directories.

## Interactions

### Object
##### Create
- When camera latitude is 90 and "add" button has been clicked:
  - Click on the floor

##### Select
- At any time:
  - Click on the object

##### Delete
- When object is selected:
  - Click delete button

### Camera
##### Move Theta // Move Phi
- At any time:
  - Click and drag on the camera control button

##### Zoom In // Zoom Out
- At any time:
  - Click on the zoom in/out button

##### Move X-Z (Pan)
- When latitude is greater than some number:
  - Click and drag on the floor

## Events

- Canvas mouseup
  - When the last event was a canvas mousedown
    - When the "add" button has been clicked
      - When the main camera latitude is 90°
        - When the first visible raycaster intersect is the floor
          - **Add an object at the mouse point**
    - When the "add" button has not been clicked