class Site3D {
    // constructor(pos=new Vec3(), vel=new Vec3(), acc=new Vec3()) {
    //     this.pos = pos
    //     this.vel = vel
    //     this.acc = acc
    // }
    constructor(pos=[0,0,0], vel=[0,0,0], force=[0,0,0], mass=1.0) {
        this.pos = new Vec3(pos)
        this.vel = new Vec3(vel)
        this.force = new Vec3(force)
        this.mass = mass; // true mass. constant.
        this.massShown = mass; // effective mass
    }
    calcSites(sites, i, hoveredId, activeId) {
        const easeRate = 0.1;
        const activeEaseRate = 0.01;
        const growFactor = 1.5;
        const repulsionStrength = 40.0;
        if(i == activeId){
            const activeMass = this.mass*growFactor+2.0;
            this.massShown = activeEaseRate*activeMass + (1-activeEaseRate)*this.massShown;

        } else if(i == hoveredId){
        this.massShown = easeRate*this.mass*growFactor + (1-easeRate)*this.massShown;
            // repulsionRadius*=Math.sqrt(growFactor)
        }else{
            this.massShown = easeRate*this.mass + (1-easeRate)*this.massShown;
        }
        // increase this too much and the screen will just converge to a lattice
        const repulsionRadius = 100*this.mass;

        // for (let j=i+1; j<sites.length; j++) {
        for (let j=0; j<sites.length; j++) {
            let other = sites[j];
            if (other === this) continue;

            const dpos = this.pos.subbed(other.pos);

            const distSq = dpos.dot(dpos);
            if (distSq === 0) continue;
            const dist = Math.sqrt(distSq);
            if (dist > repulsionRadius) continue;

            // dpos.s`ca`le(0.5*this.massShown * other.massShown * repulsionStrength / (dist*dist*dist));
            dpos.scale(0.5*this.mass * other.mass * repulsionStrength / (dist*dist*dist));
            this.force.add(dpos);
            other.force.sub(dpos);
        }
    }
    calcGoto(x, y, z=this.z) {
        let kp = 0.006;
        let kd = 0.4;
        this.force.x += (x-this.pos.x)*kp - this.vel.x*kd;
        this.force.y += (y-this.pos.y)*kp - this.vel.y*kd;
    }
    calcBounds(bounds){
        const boundaryStrength = 0.0002;
        const push = (difference) => boundaryStrength * difference;

        if (this.pos.x < bounds.xMin + bounds.margin) {
            this.force.x += push(bounds.xMin + bounds.margin - this.pos.x);
        } else if (this.pos.x > bounds.xMax - bounds.margin) {
            this.force.x += push(bounds.xMax - bounds.margin - this.pos.x);
        }

        if (this.pos.y < bounds.yMin + bounds.margin) {
            this.force.y += push(bounds.yMin + bounds.margin - this.pos.y);
        } else if (this.pos.y > bounds.yMax - bounds.margin) {
            this.force.y += push(bounds.yMax - bounds.margin - this.pos.y);
        }

        if (this.pos.z < bounds.zMin + bounds.margin) {
            this.force.z += push(bounds.zMin + bounds.margin - this.pos.z);
        } else if (this.pos.z > bounds.zMax - bounds.margin) {
            this.force.z += push(bounds.zMax - bounds.margin - this.pos.z);
        }
    }
    update(friction=0.995) {
        // console.log(this.pos, this.vel, this.acc)
        // this.vel.add(this.force.scale(1/this.mass));
        // this.vel.add(this.force.scale(1/this.massShown));
        this.vel.x += this.force.x/this.massShown;
        this.vel.y += this.force.y/this.massShown;
        this.pos.add(this.vel);
        this.vel.scale(friction)
        this.force.zero();
    }
    // focus(z){

    // }
    inFocus(x, m, g, s){
        let extra_threshold = 2.0; // for user experience...
        function gapLinear(x, m, g) {
            return m*(Math.max(x-0.5*g, 0) + Math.min(x+0.5*g, 0));
        }
        function softGapLinear(x, m, g, s) {
            let t = gapLinear(x, m, g);
            return t*Math.abs(t)/(Math.abs(t)+s*g); // magic s for softness
        }
        return (Math.abs(softGapLinear(x, m, g, s)) <= extra_threshold);
    }
}