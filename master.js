class Picture{
    constructor(width, height, pixels){
        this.width = width;
        this.height = height;
        this.pixels = pixels;
    }
    static empty(width, height, color){
        let pixels = new Array(width*height).fill(color);
        return new Picture(width, height, pixels);
    }
    pixel(x,y){
        return this.pixels[x+y*this.width];
    }
    draw(pixels){
        let copy = this.pixels.slice(); //slice return all array elements
        for(let {x,y,color} of pixels){
            copy[x + y * this.width] = color;
        }
        return new Picture(this.width, this.height, copy);
    }
}

function updateState( state, action){
    return Object.assign({}, state, action); //{...state, ...action} not standarized yet
}

function elt(type, props, ...children){
    let dom = document.createElement(type);
    if(props) Object.assign(dom, props);
    for(let child of children){
        if(typeof child != "string") dom.appendChild(child);
        else dom.appendChild(document.createTextNode(child));
    }
    return dom;
}

            //CANVAS

const scale = 10;
class PictureCanvas {
    constructor(picture, pointerDown ){
        this.dom = elt("canvas", {
            onmousedown: event => this.mouse(event, pointerDown),
            ontouchstart: event => this.touch(event, pointerDown)
        });
        this.syncState(picture);
    }
    syncState(picture){
        if(this.picture == picture) return;
        let prevPicture = this.picture;
        this.picture = picture;
        drawPicture(this.picture, this.dom, scale, prevPicture);
    }
}

function drawPicture(picture, canvas, scale, prevPicture){
    if (prevPicture == null ||
        prevPicture.width != picture.width ||
        prevPicture.height != picture.height) {
        canvas.width = picture.width * scale;
        canvas.height = picture.height * scale;
        prevPicture = null;
    }
    let cx = canvas.getContext("2d");

    for(let y = 0; y < picture.height; y++){
        for(let x = 0; x < picture.width; x++){
            let color = picture.pixel(x, y);
            if (prevPicture == null || prevPicture.pixel(x, y) != color) {
                cx.fillStyle = color;
                cx.fillRect(x * scale, y * scale, scale, scale);
            }
        }
    }
}

PictureCanvas.prototype.mouse = function(downEvent, onDown){
    if(downEvent.button !== 0) return;
    let pos = pointerPosition(downEvent, this.dom);
    let onMove = onDown(pos);
    if(!onMove) return;
    let move = moveEvent => {
        if(moveEvent.buttons == 0){
            this.dom.removeEventListener("mousemove", move);
        } else{
            let newPos = pointerPosition(moveEvent, this.dom);
            if(newPos.x == pos.x && newPos.y == pos.y) return;
            pos = newPos;
            onMove(newPos);
        }
    };
    this.dom.addEventListener("mousemove", move);
};

function pointerPosition(pos, domNode){
    let rect = domNode.getBoundingClientRect();
    return {
        x: Math.floor((pos.clientX - rect.left)/scale),
        y: Math.floor((pos.clientY - rect.top)/scale)};
}

PictureCanvas.prototype.touch = function(startEvent, onDown){
    let pos = pointerPosition(startEvent.touches[0], this.dom);
    let onMove = onDown(pos);
    startEvent.preventDefault();
    if(!onMove) return;
    let move = moveEvent => {
        let newPos = pointerPosition(moveEvent.touches[0], this.dom);
        if(newPos.x == pos.x && newPos.y == pos.y) return;
        pos = newPos;
        onMove(newPos);
    };
    let end = () => {
        this.dom.removeEventListener("touchmove", move);
        this.dom.removeEventListener("touchend", end);
    };
    this.dom.addEventListener("touchmove", move);
    this.dom.addEventListener("touchend", end);
};

        // APPLICATION

class PixelEditor {
    constructor(state, config) {
        let {tools, controls, dispatch} = config;
        this.state = state;

        this.canvas = new PictureCanvas(state.picture, pos => {
            let tool = tools[this.state.tool];
            let onMove = tool(pos, this.state, dispatch);
            if (onMove) {
                return pos => onMove(pos, this.state, dispatch);
            }
        });
        this.controls = controls.map(
            Control => new Control(state, config));
        this.dom = elt("div", {}, this.canvas.dom, elt("br"),
            ...this.controls.reduce(
                (a, c) => a.concat(" ", c.dom), []));

        this.dom.tabIndex = "0";

        this.dom.addEventListener('keydown', (event) => {
            const keyName = event.key;
            if(keyName == "r") this.state.tool = "rectangle";
            else if (keyName == "d") this.state.tool = "draw";
            else if (keyName == "f") this.state.tool = "fill";
            else if (keyName == "p") this.state.tool = "pick";
            else if (keyName == "c") this.state.tool = "circle";
            else if (keyName == "s") document.querySelector("input").click();
            else if (keyName == "z" && event.metaKey) {
                dispatch({undo: true});
            }


        });
    }
    syncState(state) {
        this.state = state;
        this.canvas.syncState(state.picture);
        for (let ctrl of this.controls) ctrl.syncState(state);
    }

}


class ToolSelect{
    constructor(state, {tools, dispatch}){
        this.select = elt("select",{
            onchange: () => dispatch({tool: this.select.value})
        }, ...Object.keys(tools).map(name => elt("option", {
            selected: name == state.tool
        }, name)));
        this.dom = elt("label", null, "Tool: ", this.select);
    }
    syncState(state) {this.select.value = state.tool; }
}


class ColorSelect {
    constructor(state, {dispatch}){
        this.input = elt("input", {
            type: "color",
            value: state.color,
            onchange: () => dispatch({color: this.input.value})
        });
        this.dom = elt("label", null, "Color: ", this.input);
    }
    syncState(state){ this.input.value = state.color;}
}

            //DRAWING TOOLS

function draw(pos, state, dispatch){
    function drawPixel({x,y}, state){
        let drawn = {x,y, color: state.color};
        dispatch({picture: state.picture.draw([drawn])});
    }
    drawPixel(pos, state);
    return drawPixel;
}

function circle(pos, state, dispatch) {
    function drawCircle(to){
        let r = Math.sqrt(Math.pow(to.x - pos.x, 2) +
                Math.pow(to.y - pos.y, 2));
        let rCeil = Math.ceil(r);
        let drawn = [];
        for(let dy = -rCeil; dy <= rCeil; dy++){
            for(let dx = -rCeil; dx <= rCeil; dx++){
                let dist = Math.sqrt(Math.pow(dx,2) + Math.pow(dy,2));
                if( dist < r){
                    let y = pos.y+dy, x = pos.x + dx;
                    if(y < 0 || y >= state.picture.height ||
                        x < 0 || x >= state.picture.width) continue;
                    drawn.push({x,y, color: state.color});
                }
                else continue;
            }
        }


        dispatch({picture: state.picture.draw(drawn)});
    }

    drawCircle(pos);
    return drawCircle;
}

function rectangle(start, state, dispatch){
    function drawRectangle(pos){
        let xStart = Math.min(start.x, pos.x);
        let yStart = Math.min(start.y, pos.y);
        let xEnd = Math.max(start.x, pos.x);
        let yEnd = Math.max(start.y, pos.y);
        let drawn = [];
        for(let y = yStart; y <= yEnd; y++){
            for(let x = xStart; x <= xEnd; x++){
                drawn.push({x,y,color: state.color});
            }
        }
        dispatch({picture: state.picture.draw(drawn)});
    }
    drawRectangle(start);
    return drawRectangle;
}

const around = [{dx: -1, dy: 0}, {dx: 1, dy: 0},
    {dx: 0, dy: -1}, {dx: 0, dy: 1}];

function fill({x,y}, state, dispatch){
    let targetColor = state.picture.pixel(x,y);
    let drawn = [{x,y, color: state.color}];
    for(let done = 0; done < drawn.length; done++){
        for(let {dx, dy} of around){
            let x = drawn[done].x + dx, y = drawn[done].y + dy;
            if(x >= 0 && x < state.picture.width &&
                state.picture.pixel(x,y) == targetColor &&
            !drawn.some(p => p.x == x && p.y == y)){
                drawn.push({x, y, color: state.color});
            }
        }
    }
    dispatch({picture: state.picture.draw(drawn)})
}

function pick(pos, state, dispatch){
    dispatch({color: state.picture.pixel(pos.x, pos.y)});
}



// SAVING AND LOADING

class SaveButton{
    constructor(state){
        this.picture = state.picture;
        this.dom = elt("button", {
            onclick: () => this.save()},
            "Save");
        }


    save(){
        let canvas = elt("canvas");
        drawPicture(this.picture, canvas, 1);
        let link = elt("a", {
            href: canvas.toDataURL(),
            download: "pixelart.png"
        });
        document.body.appendChild(link);
        link.click();
        link.remove();
    }
    syncState(state) { this.picture = state.picture;}
}

class LoadButton{
    constructor(_, {dispatch}){
        this.dom = elt("button", {
            onclick: () => startLoad(dispatch)
        }, "Load");
    }
    syncState() {}
}

function startLoad(dispatch){
    let input = elt("input", {
        type: "file",
        onchange: () => finishLoad(input.files[0],dispatch)
    });
    document.body.appendChild(input);
    input.click();
    input.remove();
}

function finishLoad(file, dispatch){
    if(file == null) return;
    let reader = new FileReader();
    reader.addEventListener("load", () => {
        let image = elt("img", {
            onload: () => dispatch({picture: pictureFromImage(image)
            }),
            src: reader.result
        });
    });
    reader.readAsDataURL(file);
}

function pictureFromImage(image){
    let width = Math.min(100, image.width);
    let height = Math.min(100, image.height);
    let canvas = elt("canvas", {width, height});
    let cx = canvas.getContext("2d");
    cx.drawImage(image, 0,0);
    let pixels = [];
    let {data} = cx.getImageData(0,0,width, height);

    function hex(n){
        return n.toString(16).padStart(2, "0");
    }
    for (let i = 0; i < data.length; i += 4){
        let[r, g, b] = data.slice(i, i + 3);
        pixels.push("#" + hex(r) + hex(g) + hex(b));
    }
    return new Picture(width, height, pixels);
}

// UNDO

function historyUpdateState(state, action){
    if(action.undo == true){
        if(state.done.length == 0) return state;
        return Object.assign({}, state, {
            picture: state.done[0],
            done: state.done.slice(1),
            doneAt: 0
        });
    } else if ( action.picture &&
        state.doneAt < Date.now() - 1000){
        return Object.assign({}, state, action, {
            done: [state.picture, ...state.done],
            doneAt: Date.now()
        });
    } else{
        return Object.assign({}, state, action);
    }
}

class UndoButton{
    constructor(state, {dispatch}){
        this.dom = elt("button", {
            onclick: () => dispatch({undo: true}),
            disabled: state.done.length == 0
        }, "Undo");
    }
    syncState(state){
        this.dom.disabled = state.done.length == 0;
    }
}

const startState = {
    tool: "draw",
    color: "#000000",
    picture: Picture.empty(60, 30, "#f0f0f0"),
    done: [],
    doneAt: 0
};



const baseTools = {draw, fill, rectangle, pick, circle};

const baseControls = [ToolSelect, ColorSelect,
    SaveButton, LoadButton, UndoButton];

function startPixelEditor({state = startState,
                              tools = baseTools,
                              controls = baseControls}) {
    let app = new PixelEditor(state, {
        tools,
        controls,
        dispatch(action) {
            state = historyUpdateState(state, action);
            app.syncState(state);
        }
    });
    return app.dom;
}

let dom = startPixelEditor({});
document.querySelector("div").appendChild(dom);

