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

class Vec3 {
    constructor(pos = [0, 0, 0]) {
        this.x = pos[0];
        this.y = pos[1];
        this.z = pos[2];
    }
    add(v) {
        return new Vec3([this.x + v.x, this.y + v.y, this.z + v.z]);
    }
    negate() {
        return new Vec3([-this.x, -this.y, -this.z]);
    }
    sub(v) {
        return this.add(v.negate());
    }
    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }
    zero() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
    }
}