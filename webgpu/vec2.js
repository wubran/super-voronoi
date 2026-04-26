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
    added(v) {
        return new Vec3([this.x + v.x, this.y + v.y, this.z + v.z]);
    }
    negated() {
        return new Vec3([-this.x, -this.y, -this.z]);
    }
    subbed(v) {
        return this.added(v.negated());
    }
    zeroed() {
        return new Vec3([0,0,0])
    }
    scaled(s) {
        return new Vec3([s*this.x, s*this.y, s*this.z]);
    }

    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z;
        return this;
    }
    negate() {
        this.x *= -1;
        this.y *= -1;
        this.z *= -1;
        return this;
    }
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z;
        return this;
    }
    zero() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        return this;
    }
    scale(s) {
        this.x *= s;
        this.y *= s;
        this.z *= s;
        return this;
    }

    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * v.z;
    }
}