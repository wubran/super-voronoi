class Animation{
    constructor(targetGet, targetSet, speed=1.0){
        this.goal = targetGet();
        this.targetGet = targetGet;
        this.targetSet = targetSet;
        this.speed = speed;
    }
    setGoal(goal){
        this.goal = goal;
    }
    step(dt=1/60){
        let a = this.targetGet();
        const alpha = 1 - Math.exp(-this.speed * dt);
        a += (this.goal - a) * alpha;
        this.targetSet(a);
    }
}