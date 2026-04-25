class Vec2 {
    // constructor(x = 0, y = 0) {
    //     this.x = x;
    //     this.y = y;
    // }
    constructor(pos) {
        this.x = pos[0];
        this.y = pos[1];
    }
    add(v) {
        return new Vec2([this.x + v.x, this.y + v.y]);
    }
    negate() {
        return new Vec2([-this.x, -this.y]);
    }
    sub(v) {
        return this.add(v.negate());
    }
    dot(v) {
        return this.x * v.x + this.y * v.y;
    }
    zero() {
        this.x = 0;
        this.y = 0;
    }
}