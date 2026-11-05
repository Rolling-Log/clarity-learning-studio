"""Authored bicycle demonstration. No model service is used for this sample."""
from copy import deepcopy

TITLE = "Inside a bicycle"
SOURCE_NAME = "Inside a bicycle · sample reading"
TEMPLATE = "bicycle-v1"
TEXT = """Inside a bicycle: from pedal to pavement.

The frame holds the wheels and riding controls in position. A typical diamond frame uses two connected triangles. The wheels rotate around their hubs; the tires provide the contact with the road.

Pressing a pedal turns the crank and front chainring. The chain transfers that rotation to a rear sprocket. When the drivetrain is engaged, the rear sprocket drives the rear wheel. The tire pushes backward against the road, and the road pushes the bicycle forward.

The gear ratio is the number of teeth on the front chainring divided by the number on the selected rear sprocket. With a 42-tooth front ring and a 28-tooth rear sprocket, one full pedal turn produces 1.5 rear-wheel turns. A larger rear sprocket lowers this ratio: less distance per pedal turn, but more rear-wheel torque for the same crank torque, ignoring losses. It does not create extra power.

A rear derailleur guides the chain sideways between the sprockets on the cassette. Its spring-loaded cage takes up chain slack as the selected sprocket changes. An indexed shifter moves the derailleur by a set amount with each click.

On this rim-brake bicycle, pulling a brake lever tensions a cable. The caliper squeezes the pads against the wheel rim. Friction resists the wheel's rotation. The handlebar steers the front wheel; braking and steering depend on the tires maintaining grip on the road.

For the interactive example, the front ring has 42 teeth and the seven rear sprockets have 28, 24, 22, 20, 18, 16 and 14 teeth. We assume a 2.1-metre wheel circumference, a fully engaged drivetrain and no slipping or losses. Wheel turns per pedal turn = front teeth / rear teeth. Distance per pedal turn = gear ratio × wheel circumference. The calculated speed in km/h = cadence in pedal revolutions per minute × distance per pedal turn × 60 / 1000. These are illustrative model settings, not a specification or measured performance of a real bicycle.

This short sample was written for Clarity. Mechanism references: Bartosz Ciechanowski, Bicycle (https://ciechanow.ski/bicycle/), and SHIMANO, Indexed Shifting Explained (https://bike.shimano.com/en-UK/stories/article/shimano-shifting-explained.html). The illustration and the seven-gear model are original examples."""

_NODES = [
    dict(id="c1", label="Pedals & crank", explanation="Your feet turn the crank. The front chainring turns with it and pulls the chain.", example="Follow one complete pedal turn. The front chainring also makes exactly one turn.", sourceIds=["S3"], chapterIndex=0),
    dict(id="c2", label="Chain", explanation="The moving chain connects the front chainring to the selected rear sprocket. It transfers the pulling force through the drivetrain.", example="Follow the upper run of the chain from the front chainring to the rear sprocket.", sourceIds=["S3"], chapterIndex=0),
    dict(id="c3", label="Cassette", explanation="The rear sprockets offer different gear ratios. A larger rear sprocket trades distance per pedal turn for more rear-wheel torque at the same crank torque.", example="42 front teeth ÷ 28 rear teeth = 1.5 wheel turns per pedal turn. Select 14 rear teeth and the ratio becomes 3.0.", sourceIds=["S4", "S7"], chapterIndex=1),
    dict(id="c4", label="Rear derailleur", explanation="The derailleur moves the chain from one rear sprocket to another. Its sprung cage also takes up chain slack.", example="Change the gear below. The selected rear tooth count changes; the front ring stays at 42 teeth.", sourceIds=["S5"], chapterIndex=1),
    dict(id="c5", label="Frame & wheels", explanation="Two connected triangles hold the main frame together. The wheels turn around their hubs, while the tires connect the bicycle to the road.", example="The rear tire pushes the road backward. The road's forward force propels the bicycle.", sourceIds=["S2", "S3"], chapterIndex=2),
    dict(id="c6", label="Brakes & controls", explanation="The brake lever pulls a cable. The caliper presses its pads against the wheel rim, creating friction that resists rotation.", example="Follow the cable from the handlebar lever to the front caliper above the wheel.", sourceIds=["S6"], chapterIndex=2),
]

def guide(mode: str) -> dict:
    # Both modes retain meaningful hotspots; mode changes narration depth.
    return dict(title=TITLE, summary="From pedal to pavement.", diagramType="relationship", nodes=deepcopy(_NODES),
        edges=[{"from":"c1","to":"c2","label":"pulls"}, {"from":"c2","to":"c3","label":"drives"}, {"from":"c4","to":"c3","label":"selects"}, {"from":"c3","to":"c5","label":"turns"}],
        chapters=[
            dict(title="Follow the power", summary="Pedal → crank → chain → rear wheel.", nodeIds=["c1","c2"], sourceIds=["S3"]),
            dict(title="Change the leverage", summary="Different sprockets, different trade-offs.", nodeIds=["c3","c4"], sourceIds=["S4","S5","S7"]),
            dict(title="Keep control", summary="Frame, wheels, steering and brakes.", nodeIds=["c5","c6"], sourceIds=["S2","S6"])
        ], takeaways=["The drivetrain transfers your pedaling force to the rear wheel.", "A larger rear sprocket gives less travel and more torque per pedal turn.", "Gears change the trade-off, not the power you create."])

NARRATION = {
    "quick": [
        "Inside a bicycle. Follow the power from your feet to the road. A pedal turns the crank and the front chainring. The chain pulls a rear sprocket, which drives the rear wheel. The tire pushes the road backward, and the road pushes the bicycle forward. Select a numbered part in the guide to see where each step happens.",
        "Gears change the trade-off. With forty-two teeth at the front and twenty-eight at the rear, one pedal turn gives one point five wheel turns. Choose a smaller rear sprocket and you travel farther per pedal turn. A larger rear sprocket gives less distance, but more wheel torque for the same crank torque. Try changing the gear in the guide. The derailleur moves the chain to the chosen rear sprocket. Gears do not create extra power.",
        "The frame holds the wheels and controls in place. Your handlebar steers the front wheel. On this example, the brake lever pulls a cable, and the brake pads squeeze the rim. Friction resists the wheel's rotation. Remember three connections: pedals to chain, chain to rear wheel, and tire to road. The guide's speed values come from its stated ideal model, not a measured ride."
    ],
    "deep": [
        "Inside a bicycle. Start with the whole bicycle in the guide, then follow the four drivetrain details below it. First, your foot presses a pedal. That force turns the crank and the front chainring. The front chainring pulls on the chain. The moving chain turns a selected rear sprocket. When the drivetrain is engaged, that sprocket drives the rear wheel. There is one final connection: the tire and the road. The tire pushes backward on the road. The road pushes forward on the tire, carrying the bicycle forward. The arrows in the guide trace the same sequence.",
        "Now change the leverage. The gear ratio is front teeth divided by rear teeth. In our example, forty-two divided by twenty-eight equals one point five. That means one complete turn of the pedals produces one and a half turns of the rear wheel. Choose fourteen rear teeth and the ratio is three. The wheel travels farther per pedal turn, but the rear-wheel torque is lower for the same crank torque. A larger rear sprocket reverses that trade-off. It gives more rear-wheel torque and less distance per pedal turn. The derailleur selects the sprocket and takes up chain slack. Try the seven gear positions, then change the cadence. The displayed speed is calculated using a two point one metre wheel circumference. This is an ideal illustration, not a prediction of a real ride, and the gears never create additional power.",
        "Finally, explore the frame, wheels and controls. The diamond frame connects two triangles. The wheels rotate around their hubs, and the tires are the bicycle's contact with the road. The handlebar turns the front wheel. This example uses rim brakes. Pulling a lever tensions a cable. The caliper brings the brake pads against the rim. Friction then resists rotation. Braking and steering depend on tire grip. Return to the drivetrain and trace the whole chain of events: your foot, the crank, the chain, a rear sprocket, the wheel, and finally the road. A useful visual guide lets you see each part in the whole, then explore what changes when you adjust one thing."
    ]
}
